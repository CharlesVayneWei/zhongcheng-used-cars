import { CarCard } from '@/components/cars/car-card';
import { Pagination } from '@/components/cars/pagination';
import { SearchFilters } from '@/components/cars/search-filters';
import { EmptyState } from '@/components/ui/empty-state';
import { getPublicBrands, searchPublicCars } from '@/lib/data/cars';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const optionalNumber = (value: string | undefined) => value && Number.isFinite(Number(value)) ? Number(value) : undefined;
const optionalPage = (value: string | undefined) => {
  const parsed = Number(value);
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export default async function CarsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, one(value)])) as Record<string, string | undefined>;
  const filters = {
    q: values.q?.trim(), brand: values.brand?.trim(), minPrice: optionalNumber(values.minPrice), maxPrice: optionalNumber(values.maxPrice),
    yearFrom: optionalNumber(values.yearFrom), yearTo: optionalNumber(values.yearTo), mileageMax: optionalNumber(values.mileageMax),
    sort: ['price_asc', 'price_desc'].includes(values.sort ?? '') ? values.sort as 'price_asc' | 'price_desc' : 'latest' as const,
    page: optionalPage(values.page) ?? 1, pageSize: 12,
  };
  const [result, brands] = await Promise.all([searchPublicCars(filters), getPublicBrands()]);
  return <div className="page-width py-14 sm:py-20">
    <div className="mb-10 text-center"><p className="eyebrow">Vehicle inventory</p><h1 className="display-font mt-3 text-5xl sm:text-6xl">精选车源</h1><p className="mt-4 text-sm text-[#86868b]">共找到 {result.count} 辆车辆</p></div>
    <SearchFilters brands={brands} values={values}/>
    <div className="mt-8 flex justify-end"><form action="/cars">{Object.entries(values).filter(([key, value]) => value && !['sort', 'page'].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value}/>) }<select name="sort" defaultValue={filters.sort} className="h-10 rounded-full border border-[#d2d2d7] bg-white px-4 text-sm"><option value="latest">最新发布</option><option value="price_asc">价格从低到高</option><option value="price_desc">价格从高到低</option></select><button className="ml-2 h-10 rounded-full bg-[#1d1d1f] px-5 text-sm font-semibold text-white">排序</button></form></div>
    {result.cars.length ? <div className="mt-6 grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{result.cars.map((car) => <CarCard key={car.id} car={car}/>)}</div> : <div className="mt-5"><EmptyState title="没有找到符合条件的车辆" description="试试调整品牌、价格、年份或里程条件。"/></div>}
    <Pagination page={result.page} pageSize={result.pageSize} count={result.count} query={values}/>
  </div>;
}
