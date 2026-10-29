export type CarStatus = 'draft' | 'published' | 'sold' | 'archived';
export type InsuranceStatus = 'insured' | 'uninsured' | 'unknown';

export interface CarImage {
  id: string;
  car_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  public_url?: string;
}

export interface Car {
  id: string;
  title: string | null;
  brand: string | null;
  model: string | null;
  registration_year: number | null;
  registration_province: string | null;
  registration_city: string | null;
  insurance_status: InsuranceStatus;
  insurance_expiry: string | null;
  mileage_km: number | null;
  cash_price_yuan: number | null;
  installment_price_yuan: number | null;
  down_payment_yuan: number | null;
  condition_description: string | null;
  status: CarStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  car_images: CarImage[];
}

export interface SiteSettings {
  site_name: string;
  tagline: string;
  consultation_phone: string | null;
  consultation_wechat: string | null;
}

export interface CarSearchFilters {
  q?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  yearFrom?: number;
  yearTo?: number;
  mileageMax?: number;
  sort?: 'latest' | 'price_asc' | 'price_desc';
  page?: number;
  pageSize?: number;
}

export interface CarSearchResult {
  cars: Car[];
  count: number;
  page: number;
  pageSize: number;
}

export interface ActionState {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
