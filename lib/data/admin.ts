import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Car } from '@/lib/types';

export async function requireAdmin() {
  const client = await createSupabaseServerClient();
  if (!client) redirect('/admin/login?error=config');
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: profile } = await client.from('admin_profiles').select('user_id, display_name, login_name').eq('user_id', user.id).maybeSingle();
  if (!profile) {
    await client.auth.signOut();
    redirect('/admin/login?error=forbidden');
  }
  return { client, user, profile };
}

export async function listAdminCars(search = '', status = ''): Promise<Car[]> {
  const { client } = await requireAdmin();
  let query = client.from('cars').select('*, car_images(*)').order('updated_at', { ascending: false });
  if (search) {
    const keyword = search.slice(0, 80).replace(/[,()%]/g, ' ').trim();
    if (keyword) query = query.or(`title.ilike.%${keyword}%,brand.ilike.%${keyword}%,model.ilike.%${keyword}%`);
  }
  if (['draft', 'published', 'sold', 'archived'].includes(status)) query = query.eq('status', status);
  const { data, error } = await query.limit(200);
  if (error) throw new Error(`读取后台车辆失败：${error.message}`);
  return (data ?? []) as unknown as Car[];
}

export async function getAdminCar(id: string): Promise<Car | null> {
  const { client } = await requireAdmin();
  const { data, error } = await client.from('cars').select('*, car_images(*)').eq('id', id).maybeSingle();
  if (error) throw new Error(`读取车辆失败：${error.message}`);
  if (!data) return null;
  const car = data as unknown as Car;
  car.car_images = [...(car.car_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (base) car.car_images = car.car_images.map((image) => ({
    ...image,
    public_url: `${base}/storage/v1/object/public/car-images/${image.storage_path.split('/').map(encodeURIComponent).join('/')}`,
  }));
  return car;
}
