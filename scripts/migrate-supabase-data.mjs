import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import sharp from 'sharp';

const { Pool } = pg;
const command = process.argv[2];
if (!['import', 'verify', 'rollback'].includes(command)) {
  throw new Error('用法：pnpm migrate:supabase -- import|verify|rollback');
}

const targetUrl = process.env.DATABASE_URL;
const sourceUrl = process.env.SUPABASE_SOURCE_DATABASE_URL;
const sourceBase = process.env.SUPABASE_SOURCE_URL?.replace(/\/$/, '');
const sourceKey = process.env.MIGRATION_SOURCE_KEY?.trim();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads'));
const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const targetStoragePattern = new RegExp(`^${uuidPattern}/${uuidPattern}\\.webp$`);
const sourceStoragePattern = new RegExp(`^${uuidPattern}/${uuidPattern}\\.(?:jpe?g|png|webp)$`, 'i');
if (!targetUrl || !sourceKey) throw new Error('缺少 DATABASE_URL 或 MIGRATION_SOURCE_KEY');
if (command !== 'rollback' && (!sourceUrl || !sourceBase)) {
  throw new Error('import/verify 还需要 SUPABASE_SOURCE_DATABASE_URL 与 SUPABASE_SOURCE_URL');
}

const targetPool = new Pool({ connectionString: targetUrl, max: 1 });
const sourcePool = sourceUrl ? new Pool({ connectionString: sourceUrl, max: 1, ssl: process.env.SUPABASE_SOURCE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: false } }) : null;

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function contentHash(value) {
  return hash(JSON.stringify(value, Object.keys(value).sort()));
}

function encodeStoragePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function targetImagePath(storagePath) {
  if (!targetStoragePattern.test(storagePath)) throw new Error(`不安全的目标图片路径：${storagePath}`);
  const absolute = path.resolve(uploadDir, ...storagePath.split('/'));
  const relative = path.relative(uploadDir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`目标图片越界：${storagePath}`);
  return absolute;
}

async function readSource() {
  const hasLogin = await sourcePool.query(
    `select exists(select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'admin_profiles' and column_name = 'login_name') as value`,
  );
  const profileSql = hasLogin.rows[0].value
    ? 'select user_id, display_name, login_name, created_at from public.admin_profiles order by created_at, user_id'
    : `select user_id, display_name, ('admin_' || left(replace(user_id::text, '-', ''), 20)) as login_name, created_at
       from public.admin_profiles order by created_at, user_id`;
  const [profiles, cars, images, settings, audits] = await Promise.all([
    sourcePool.query(profileSql),
    sourcePool.query('select * from public.cars order by created_at, id'),
    sourcePool.query('select * from public.car_images order by car_id, sort_order, created_at, id'),
    sourcePool.query('select * from public.site_settings where id = true'),
    sourcePool.query('select * from public.admin_audit_logs order by id'),
  ]);
  const profileRows = [...profiles.rows];
  const knownAdmins = new Set(profileRows.map((profile) => String(profile.user_id)));
  const referencedAdmins = new Set([
    ...cars.rows.flatMap((car) => [car.created_by, car.updated_by]),
    ...images.rows.map((image) => image.created_by),
    ...audits.rows.map((audit) => audit.user_id),
    settings.rows[0]?.updated_by,
  ].filter(Boolean).map(String));
  for (const userId of referencedAdmins) {
    if (knownAdmins.has(userId)) continue;
    profileRows.push({
      user_id: userId,
      display_name: '迁移管理员',
      login_name: `legacy_${userId.replaceAll('-', '').slice(0, 20)}`,
      created_at: new Date(0),
    });
  }
  return { profiles: profileRows, cars: cars.rows, images: images.rows, settings: settings.rows[0] ?? null, audits: audits.rows };
}

async function downloadImages(images, stagingDir) {
  await fs.mkdir(stagingDir, { recursive: true, mode: 0o750 });
  const headers = {};
  if (process.env.SUPABASE_SOURCE_SERVICE_ROLE_KEY) {
    headers.apikey = process.env.SUPABASE_SOURCE_SERVICE_ROLE_KEY;
    headers.Authorization = `Bearer ${process.env.SUPABASE_SOURCE_SERVICE_ROLE_KEY}`;
  }
  const staged = new Map();
  for (const image of images) {
    if (!sourceStoragePattern.test(image.storage_path)) throw new Error(`拒绝异常的源图片路径：${image.storage_path}`);
    const access = process.env.SUPABASE_SOURCE_SERVICE_ROLE_KEY ? 'authenticated' : 'public';
    const url = `${sourceBase}/storage/v1/object/${access}/car-images/${encodeStoragePath(image.storage_path)}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`下载图片失败：${image.id} HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (declaredLength > 8 * 1024 * 1024) throw new Error(`源图片过大：${image.id}`);
    const input = Buffer.from(await response.arrayBuffer());
    if (!input.length || input.length > 8 * 1024 * 1024) throw new Error(`源图片大小无效：${image.id}`);
    const output = await sharp(input, { failOn: 'warning', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();
    if (!output.length || output.length > 5 * 1024 * 1024) throw new Error(`WebP 图片超过 5 MB：${image.id}`);
    const stagedPath = path.join(stagingDir, `${image.id}.webp`);
    await fs.writeFile(stagedPath, output, { flag: 'wx', mode: 0o640 });
    staged.set(String(image.id), { stagedPath, size: output.length, hash: hash(output) });
  }
  return staged;
}

async function getOrCreateSource(client) {
  const result = await client.query(
    `insert into data_migration_sources(source_key, description)
     values ($1, $2) on conflict (source_key) do update set description = excluded.description returning id`,
    [sourceKey, `Supabase migration from ${new URL(sourceBase || 'https://rollback.invalid').hostname}`],
  );
  return result.rows[0].id;
}

async function recordFor(client, sourceId, entityType, sourceEntityId) {
  const result = await client.query(
    `select target_entity_id, metadata from data_migration_records
     where source_id = $1 and entity_type = $2 and source_entity_id = $3`,
    [sourceId, entityType, String(sourceEntityId)],
  );
  return result.rows[0] ?? null;
}

async function saveRecord(client, sourceId, entityType, sourceEntityId, targetEntityId, checksum, metadata = {}) {
  await client.query(
    `insert into data_migration_records(source_id, entity_type, source_entity_id, target_entity_id, content_hash, metadata)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (source_id, entity_type, source_entity_id) do update set
       target_entity_id = excluded.target_entity_id, content_hash = excluded.content_hash,
       metadata = excluded.metadata, imported_at = now()`,
    [sourceId, entityType, String(sourceEntityId), String(targetEntityId), checksum, metadata],
  );
}

async function importData() {
  const source = await readSource();
  const runId = randomUUID();
  const stagingDir = path.join(uploadDir, '.migration-staging', runId);
  const backupDir = path.join(uploadDir, '.migration-backup', runId);
  const staged = await downloadImages(source.images, stagingDir);
  const target = await targetPool.connect();
  const fileChanges = [];
  let committed = false;
  try {
    await target.query('begin');
    await target.query('select pg_advisory_xact_lock($1)', [82374622]);
    const sourceId = await getOrCreateSource(target);
    const previousSettings = await target.query('select to_jsonb(site_settings) as value from site_settings where id = true');
    await target.query(
      `insert into data_migration_runs(id, source_id, status, previous_settings) values ($1,$2,'running',$3)`,
      [runId, sourceId, previousSettings.rows[0]?.value ?? null],
    );

    const disabledPasswordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
    for (const profile of source.profiles) {
      const existingRecord = await recordFor(target, sourceId, 'admin', profile.user_id);
      if (!existingRecord) {
        const idConflict = await target.query('select id from admins where id = $1', [profile.user_id]);
        const loginConflict = await target.query('select id from admins where lower(login_name) = lower($1)', [profile.login_name]);
        let created = false;
        if (!idConflict.rowCount) {
          if (loginConflict.rowCount) throw new Error(`管理员登录名冲突：${profile.login_name}`);
          await target.query(
            `insert into admins(id, login_name, display_name, password_hash, disabled, created_at)
             values ($1,$2,$3,$4,true,$5)`,
            [profile.user_id, profile.login_name, profile.display_name, disabledPasswordHash, profile.created_at],
          );
          created = true;
        }
        await saveRecord(target, sourceId, 'admin', profile.user_id, profile.user_id, contentHash(profile), { created });
      }
    }

    for (const car of source.cars) {
      const existingRecord = await recordFor(target, sourceId, 'car', car.id);
      if (!existingRecord) {
        const conflict = await target.query('select id from cars where id = $1', [car.id]);
        if (conflict.rowCount) throw new Error(`车辆 ID 与非迁移数据冲突：${car.id}`);
        await target.query(
          `insert into cars(id,title,brand,model,registration_year,registration_province,registration_city,
             insurance_status,insurance_expiry,mileage_km,cash_price_yuan,installment_price_yuan,down_payment_yuan,
             condition_description,status,published_at,created_by,updated_by,created_at,updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8::insurance_status,$9,$10,$11,$12,$13,$14,'draft',null,$15,$16,$17,$18)`,
          [car.id,car.title,car.brand,car.model,car.registration_year,car.registration_province,car.registration_city,
            car.insurance_status,car.insurance_expiry,car.mileage_km,car.cash_price_yuan,car.installment_price_yuan,
            car.down_payment_yuan,car.condition_description,car.created_by,car.updated_by,car.created_at,car.updated_at],
        );
      } else {
        await target.query(`update cars set status='draft', published_at=null where id=$1`, [car.id]);
        await target.query(
          `update cars set title=$2,brand=$3,model=$4,registration_year=$5,registration_province=$6,
           registration_city=$7,insurance_status=$8::insurance_status,insurance_expiry=$9,mileage_km=$10,
           cash_price_yuan=$11,installment_price_yuan=$12,down_payment_yuan=$13,condition_description=$14,
           created_by=$15,updated_by=$16,created_at=$17,updated_at=$18 where id=$1`,
          [car.id,car.title,car.brand,car.model,car.registration_year,car.registration_province,car.registration_city,
            car.insurance_status,car.insurance_expiry,car.mileage_km,car.cash_price_yuan,car.installment_price_yuan,
            car.down_payment_yuan,car.condition_description,car.created_by,car.updated_by,car.created_at,car.updated_at],
        );
      }
      await saveRecord(target, sourceId, 'car', car.id, car.id, contentHash(car));
    }

    const grouped = new Map();
    for (const image of source.images) {
      const group = grouped.get(String(image.car_id)) ?? [];
      group.push(image);
      grouped.set(String(image.car_id), group);
    }
    await target.query('set constraints car_images_car_sort_unique deferred');
    for (const [carId, images] of grouped) {
      await target.query('update car_images set is_cover=false where car_id=$1', [carId]);
      let coverAssigned = false;
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const stagedImage = staged.get(String(image.id));
        const storagePath = `${carId}/${image.id}.webp`;
        const finalPath = targetImagePath(storagePath);
        const existingRecord = await recordFor(target, sourceId, 'image', image.id);
        const targetConflict = await target.query('select id from car_images where id = $1', [image.id]);
        if (!existingRecord && targetConflict.rowCount) throw new Error(`图片 ID 与非迁移数据冲突：${image.id}`);

        await fs.mkdir(path.dirname(finalPath), { recursive: true, mode: 0o750 });
        let backupPath = null;
        try {
          await fs.access(finalPath, fsConstants.F_OK);
          if (!existingRecord) throw new Error(`图片文件与非迁移数据冲突：${storagePath}`);
          await fs.mkdir(backupDir, { recursive: true, mode: 0o750 });
          backupPath = path.join(backupDir, `${image.id}.webp`);
          await fs.rename(finalPath, backupPath);
        } catch (error) {
          if (error.code !== 'ENOENT' && !String(error.message).startsWith('图片文件与')) throw error;
          if (String(error.message).startsWith('图片文件与')) throw error;
        }
        fileChanges.push({ finalPath, backupPath });
        await fs.rename(stagedImage.stagedPath, finalPath);

        const isCover = image.is_cover && !coverAssigned ? true : index === 0 && !images.some((item) => item.is_cover);
        if (isCover) coverAssigned = true;
        if (existingRecord) {
          await target.query(
            `update car_images set car_id=$2,storage_path=$3,sort_order=$4,is_cover=false,
             mime_type='image/webp',size_bytes=$5,created_by=$6,created_at=$7 where id=$1`,
            [image.id,carId,storagePath,index,stagedImage.size,image.created_by,image.created_at],
          );
        } else {
          await target.query(
            `insert into car_images(id,car_id,storage_path,sort_order,is_cover,mime_type,size_bytes,created_by,created_at)
             values ($1,$2,$3,$4,false,'image/webp',$5,$6,$7)`,
            [image.id,carId,storagePath,index,stagedImage.size,image.created_by,image.created_at],
          );
        }
        if (isCover) await target.query('update car_images set is_cover=true where id=$1', [image.id]);
        await saveRecord(target, sourceId, 'image', image.id, image.id, stagedImage.hash, { storage_path: storagePath });
      }
    }

    for (const car of source.cars) {
      await target.query(
        `update cars set status=$2::car_status,published_at=$3,updated_at=$4 where id=$1`,
        [car.id, car.status, car.published_at, car.updated_at],
      );
    }

    if (source.settings) {
      await target.query(
        `update site_settings set site_name=$1,tagline=$2,consultation_phone=$3,consultation_wechat=$4,
         updated_at=$5,updated_by=$6 where id=true`,
        [source.settings.site_name,source.settings.tagline,source.settings.consultation_phone,
          source.settings.consultation_wechat,source.settings.updated_at,source.settings.updated_by],
      );
      await saveRecord(target, sourceId, 'settings', 'true', 'true', contentHash(source.settings));
    }

    for (const audit of source.audits) {
      if (await recordFor(target, sourceId, 'audit', audit.id)) continue;
      const inserted = await target.query(
        `insert into admin_audit_logs(user_id,action,entity_type,entity_id,details,legacy_source_id,created_at)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [audit.user_id,audit.action,audit.entity_type,audit.entity_id,audit.details,audit.id,audit.created_at],
      );
      await saveRecord(target, sourceId, 'audit', audit.id, inserted.rows[0].id, contentHash(audit));
    }

    const summary = { admins: source.profiles.length, cars: source.cars.length, images: source.images.length, audits: source.audits.length };
    await target.query(
      `update data_migration_runs set status='completed',summary=$2,finished_at=now() where id=$1`,
      [runId, summary],
    );
    await target.query('commit');
    committed = true;
    try {
      await fs.rm(backupDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`迁移已提交，但旧图片临时备份清理失败：${error.message}`);
    }
    console.log(JSON.stringify({ status: 'completed', runId, sourceKey, ...summary }, null, 2));
  } catch (error) {
    if (!committed) {
      await target.query('rollback');
      for (const change of fileChanges.reverse()) {
        await fs.rm(change.finalPath, { force: true });
        if (change.backupPath) await fs.rename(change.backupPath, change.finalPath);
      }
    }
    throw error;
  } finally {
    target.release();
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}

async function verifyData() {
  const source = await readSource();
  const target = await targetPool.connect();
  try {
    const sourceRow = await target.query('select id from data_migration_sources where source_key=$1', [sourceKey]);
    if (!sourceRow.rows[0]) throw new Error('目标库没有该 MIGRATION_SOURCE_KEY 的迁移记录');
    const sourceId = sourceRow.rows[0].id;
    const counts = await Promise.all([
      target.query(`select count(*)::integer as value from data_migration_records r join admins a on a.id::text=r.target_entity_id where r.source_id=$1 and r.entity_type='admin'`, [sourceId]),
      target.query(`select count(*)::integer as value from data_migration_records r join cars c on c.id::text=r.target_entity_id where r.source_id=$1 and r.entity_type='car'`, [sourceId]),
      target.query(`select count(*)::integer as value from data_migration_records r join car_images i on i.id::text=r.target_entity_id where r.source_id=$1 and r.entity_type='image'`, [sourceId]),
      target.query(`select count(*)::integer as value from data_migration_records r join admin_audit_logs l on l.id::text=r.target_entity_id where r.source_id=$1 and r.entity_type='audit'`, [sourceId]),
      target.query(`select count(*)::integer as value from data_migration_records r join site_settings s on s.id::text=r.target_entity_id where r.source_id=$1 and r.entity_type='settings'`, [sourceId]),
    ]);
    const actual = {
      admin: counts[0].rows[0].value,
      car: counts[1].rows[0].value,
      image: counts[2].rows[0].value,
      audit: counts[3].rows[0].value,
      settings: counts[4].rows[0].value,
    };
    const expected = { admin: source.profiles.length, car: source.cars.length, image: source.images.length, audit: source.audits.length, settings: source.settings ? 1 : 0 };
    const missingFiles = [];
    const imageRecords = await target.query(
      `select metadata->>'storage_path' as storage_path,content_hash from data_migration_records
       where source_id=$1 and entity_type='image'`,
      [sourceId],
    );
    for (const record of imageRecords.rows) {
      try {
        const bytes = await fs.readFile(targetImagePath(record.storage_path));
        if (hash(bytes) !== record.content_hash) missingFiles.push(`${record.storage_path}:checksum`);
      } catch {
        missingFiles.push(`${record.storage_path}:missing`);
      }
    }
    const mismatches = Object.entries(expected).filter(([key, value]) => (actual[key] ?? 0) !== value);
    const result = { status: mismatches.length || missingFiles.length ? 'failed' : 'verified', sourceKey, expected, actual, missingFiles };
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'verified') process.exitCode = 1;
  } finally {
    target.release();
  }
}

async function rollbackData() {
  const target = await targetPool.connect();
  const files = [];
  let committed = false;
  try {
    await target.query('begin');
    await target.query('select pg_advisory_xact_lock($1)', [82374622]);
    const sourceRow = await target.query('select id from data_migration_sources where source_key=$1 for update', [sourceKey]);
    if (!sourceRow.rows[0]) throw new Error('没有可回滚的迁移记录');
    const sourceId = sourceRow.rows[0].id;
    const records = await target.query(
      `select entity_type,target_entity_id,metadata from data_migration_records where source_id=$1`,
      [sourceId],
    );
    for (const record of records.rows.filter((row) => row.entity_type === 'image')) files.push(record.metadata.storage_path);
    for (const storagePath of files) {
      await target.query(
        `insert into storage_cleanup_queue(storage_path) values ($1)
         on conflict (storage_path) do nothing`,
        [storagePath],
      );
    }
    const carIds = records.rows.filter((row) => row.entity_type === 'car').map((row) => row.target_entity_id);
    const auditIds = records.rows.filter((row) => row.entity_type === 'audit').map((row) => row.target_entity_id);
    if (carIds.length) {
      await target.query(`update cars set status='archived' where id = any($1::uuid[])`, [carIds]);
      await target.query('delete from cars where id = any($1::uuid[])', [carIds]);
    }
    if (auditIds.length) await target.query('delete from admin_audit_logs where id = any($1::bigint[])', [auditIds]);
    const previous = await target.query(
      `select previous_settings from data_migration_runs
       where source_id=$1 and status='completed' order by started_at asc limit 1`,
      [sourceId],
    );
    if (previous.rows[0]?.previous_settings) {
      const value = previous.rows[0].previous_settings;
      await target.query(
        `update site_settings set site_name=$1,tagline=$2,consultation_phone=$3,consultation_wechat=$4,
         updated_by=$5,updated_at=$6 where id=true`,
        [value.site_name,value.tagline,value.consultation_phone,value.consultation_wechat,value.updated_by,value.updated_at],
      );
    }
    for (const record of records.rows.filter((row) => row.entity_type === 'admin' && row.metadata.created)) {
      await target.query('delete from admins where id=$1 and disabled', [record.target_entity_id]);
    }
    await target.query(`update data_migration_runs set status='rolled_back',finished_at=now() where source_id=$1 and status='completed'`, [sourceId]);
    await target.query('delete from data_migration_records where source_id=$1', [sourceId]);
    await target.query('commit');
    committed = true;
    for (const storagePath of files) {
      try {
        await fs.rm(targetImagePath(storagePath), { force: true });
        await target.query('delete from storage_cleanup_queue where storage_path=$1', [storagePath]);
      } catch (error) {
        await target.query(
          `update storage_cleanup_queue set attempts=attempts+1,last_error=$2 where storage_path=$1`,
          [storagePath, String(error.message || error).slice(0, 1000)],
        );
      }
    }
    console.log(JSON.stringify({ status: 'rolled_back', sourceKey, cars: carIds.length, images: files.length }, null, 2));
  } catch (error) {
    if (!committed) await target.query('rollback');
    throw error;
  } finally {
    target.release();
  }
}

try {
  if (command === 'import') await importData();
  if (command === 'verify') await verifyData();
  if (command === 'rollback') await rollbackData();
} finally {
  await sourcePool?.end();
  await targetPool.end();
}
