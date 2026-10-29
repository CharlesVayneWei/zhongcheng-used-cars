import { z } from 'zod';
import type { CarStatus, InsuranceStatus } from '@/lib/types';

const currentYear = new Date().getFullYear();

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text || null;
}

function optionalInteger(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

const carSchema = z.object({
  title: z.string().max(160).nullable(),
  brand: z.string().max(80).nullable(),
  model: z.string().max(120).nullable(),
  registration_year: z.number().int().min(1980).max(currentYear + 1).nullable(),
  registration_province: z.string().max(40).nullable(),
  registration_city: z.string().max(40).nullable(),
  insurance_status: z.enum(['insured', 'uninsured', 'unknown']),
  insurance_expiry: z.iso.date().nullable(),
  mileage_km: z.number().int().min(0).max(5_000_000).nullable(),
  cash_price_yuan: z.number().int().min(0).max(1_000_000_000).nullable(),
  installment_price_yuan: z.number().int().min(0).max(1_000_000_000).nullable(),
  down_payment_yuan: z.number().int().min(0).max(1_000_000_000).nullable(),
  condition_description: z.string().max(10_000).nullable(),
  status: z.enum(['draft', 'published', 'sold', 'archived']),
}).superRefine((value, context) => {
  if (value.insurance_status === 'insured' && !value.insurance_expiry) {
    context.addIssue({ code: 'custom', path: ['insurance_expiry'], message: '有保险时必须填写保险到期日' });
  }
  if (value.insurance_status !== 'insured' && value.insurance_expiry) {
    context.addIssue({ code: 'custom', path: ['insurance_expiry'], message: '无保险或未知时请清空到期日' });
  }
  if (value.down_payment_yuan != null && value.installment_price_yuan == null) {
    context.addIssue({ code: 'custom', path: ['installment_price_yuan'], message: '填写首付时必须填写分期价格' });
  }
  if (value.down_payment_yuan != null && value.installment_price_yuan != null && value.down_payment_yuan > value.installment_price_yuan) {
    context.addIssue({ code: 'custom', path: ['down_payment_yuan'], message: '首付不能超过分期价格' });
  }
});

export type CarMutation = z.infer<typeof carSchema>;

export function parseCarForm(formData: FormData, imageCount: number) {
  const requestedStatus = String(formData.get('status') ?? 'draft') as CarStatus;
  const insuranceStatus = String(formData.get('insurance_status') ?? 'unknown') as InsuranceStatus;
  const raw = {
    title: optionalText(formData.get('title')),
    brand: optionalText(formData.get('brand')),
    model: optionalText(formData.get('model')),
    registration_year: optionalInteger(formData.get('registration_year')),
    registration_province: optionalText(formData.get('registration_province')),
    registration_city: optionalText(formData.get('registration_city')),
    insurance_status: insuranceStatus,
    insurance_expiry: insuranceStatus === 'insured' ? optionalText(formData.get('insurance_expiry')) : null,
    mileage_km: optionalInteger(formData.get('mileage_km')),
    cash_price_yuan: optionalInteger(formData.get('cash_price_yuan')),
    installment_price_yuan: optionalInteger(formData.get('installment_price_yuan')),
    down_payment_yuan: optionalInteger(formData.get('down_payment_yuan')),
    condition_description: optionalText(formData.get('condition_description')),
    status: requestedStatus,
  };
  const parsed = carSchema.safeParse(raw);
  if (!parsed.success) return parsed;

  if (requestedStatus === 'published' || requestedStatus === 'sold') {
    const required: Array<keyof CarMutation> = [
      'title', 'brand', 'model', 'registration_year', 'registration_province', 'registration_city',
      'mileage_km', 'cash_price_yuan', 'condition_description',
    ];
    const issues: z.core.$ZodIssue[] = [];
    for (const field of required) {
      if (parsed.data[field] == null || parsed.data[field] === '') {
        issues.push({ code: 'custom', path: [field], message: '发布或标记已售前必须填写' });
      }
    }
    if (imageCount < 1) issues.push({ code: 'custom', path: ['images'], message: '发布前至少上传一张车辆图片' });
    if (issues.length) return { success: false as const, error: new z.ZodError(issues) };
  }
  return parsed;
}

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateVehicleImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) return '仅支持 JPG、PNG、WEBP 图片';
  if (file.size <= 0) return '图片文件为空';
  if (file.size > MAX_IMAGE_BYTES) return '单张图片不能超过 5 MB';
  return null;
}

export function flattenCarErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
