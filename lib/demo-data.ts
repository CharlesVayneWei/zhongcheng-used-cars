import type { Car, SiteSettings } from './types';

const now = '2026-10-18T08:00:00.000Z';

export const demoSettings: SiteSettings = {
  site_name: '众成精品车行',
  tagline: '每一辆，都值得被认真选择',
  consultation_phone: '13912845200',
  consultation_wechat: '13912845200',
};

export const demoCars: Car[] = [
  {
    id: 'demo-bmw-530', title: '宝马 5系 2022款 530Li 尊享型', brand: '宝马', model: '530Li 尊享型',
    registration_year: 2022, registration_province: '浙江', registration_city: '杭州', insurance_status: 'insured',
    insurance_expiry: '2027-03-12', mileage_km: 28600, cash_price_yuan: 318000, installment_price_yuan: 302000,
    down_payment_yuan: 88000, condition_description: '原版原漆，车况精品。\n4S 店全程保养，可查记录。', status: 'published',
    created_at: now, updated_at: now, published_at: now, car_images: [],
  },
  {
    id: 'demo-benz-e300', title: '奔驰 E级 2021款 E 300 L 豪华型', brand: '奔驰', model: 'E 300 L 豪华型',
    registration_year: 2021, registration_province: '江苏', registration_city: '苏州', insurance_status: 'insured',
    insurance_expiry: '2027-01-20', mileage_km: 41200, cash_price_yuan: 336000, installment_price_yuan: 319000,
    down_payment_yuan: 96000, condition_description: '一手车，内饰整洁。\n无重大事故，无水泡火烧。', status: 'published',
    created_at: now, updated_at: now, published_at: now, car_images: [],
  },
  {
    id: 'demo-audi-a6', title: '奥迪 A6L 2023款 45 TFSI quattro', brand: '奥迪', model: '45 TFSI quattro',
    registration_year: 2023, registration_province: '上海', registration_city: '上海', insurance_status: 'insured',
    insurance_expiry: '2027-06-02', mileage_km: 17800, cash_price_yuan: 365000, installment_price_yuan: 348000,
    down_payment_yuan: 108000, condition_description: '准新车状态，原厂漆面。\n配置齐全，双钥匙。', status: 'published',
    created_at: now, updated_at: now, published_at: now, car_images: [],
  },
  {
    id: 'demo-tesla-y', title: '特斯拉 Model Y 2022款 长续航版', brand: '特斯拉', model: 'Model Y 长续航版',
    registration_year: 2022, registration_province: '广东', registration_city: '深圳', insurance_status: 'insured',
    insurance_expiry: '2026-12-18', mileage_km: 35200, cash_price_yuan: 209000, installment_price_yuan: null,
    down_payment_yuan: null, condition_description: '电池健康度良好。\n外观有轻微使用痕迹，已如实拍摄。', status: 'published',
    created_at: now, updated_at: now, published_at: now, car_images: [],
  },
  {
    id: 'demo-volvo-xc60', title: '沃尔沃 XC60 2021款 B5 四驱智远', brand: '沃尔沃', model: 'B5 四驱智远',
    registration_year: 2021, registration_province: '四川', registration_city: '成都', insurance_status: 'unknown',
    insurance_expiry: null, mileage_km: 49600, cash_price_yuan: 238000, installment_price_yuan: 226000,
    down_payment_yuan: 68000, condition_description: '家庭一手用车，底盘扎实。\n已完成全车检测。', status: 'sold',
    created_at: now, updated_at: now, published_at: now, car_images: [],
  },
  {
    id: 'demo-lexus-es', title: '雷克萨斯 ES 2020款 300h 卓越版', brand: '雷克萨斯', model: '300h 卓越版',
    registration_year: 2020, registration_province: '福建', registration_city: '厦门', insurance_status: 'uninsured',
    insurance_expiry: null, mileage_km: 63800, cash_price_yuan: 246000, installment_price_yuan: 235000,
    down_payment_yuan: 72000, condition_description: '混动系统状态良好。\n座椅正常使用痕迹。', status: 'published',
    created_at: now, updated_at: now, published_at: now, car_images: [],
  },
];
