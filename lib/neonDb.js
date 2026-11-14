import { neon, Pool } from "@neondatabase/serverless";

let sqlInstance = null;
let schemaPromise = null;

export function isNeonConfigured() {
  return Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);
}

export function getSql() {
  const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for Neon Postgres.");
  }
  if (!sqlInstance) {
    sqlInstance = neon(connectionString);
  }
  return sqlInstance;
}

function createTxSql(client) {
  return async function tx(strings, ...values) {
    let text = "";
    for (let i = 0; i < strings.length; i += 1) {
      text += strings[i];
      if (i < values.length) {
        text += `$${i + 1}`;
      }
    }
    const result = await client.query(text, values);
    return result.rows;
  };
}

export async function withTransaction(callback) {
  const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for Neon Postgres.");
  }
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(createTxSql(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

export async function ensureNeonSchema() {
  if (!isNeonConfigured()) return false;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(742918432)`,
        sql`
          CREATE TABLE IF NOT EXISTS movies (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'movie',
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            mux_asset_id TEXT NOT NULL DEFAULT '',
            mux_playback_id TEXT NOT NULL DEFAULT '',
            mux_video_id TEXT NOT NULL DEFAULT '',
            movie_url TEXT NOT NULL DEFAULT '',
            stream_url TEXT NOT NULL DEFAULT '',
            thumbnail TEXT NOT NULL DEFAULT '',
            backdrop_url TEXT NOT NULL DEFAULT '',
            trailer TEXT NOT NULL DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 0,
            release_year INTEGER,
            release_date TIMESTAMPTZ,
            maturity_rating TEXT NOT NULL DEFAULT '',
            genres JSONB NOT NULL DEFAULT '[]'::jsonb,
            cast_members JSONB NOT NULL DEFAULT '[]'::jsonb,
            director TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT '',
            subtitles JSONB NOT NULL DEFAULT '[]'::jsonb,
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            views INTEGER NOT NULL DEFAULT 0,
            featured BOOLEAN NOT NULL DEFAULT false,
            is_premium BOOLEAN NOT NULL DEFAULT false,
            plan TEXT NOT NULL DEFAULT 'free',
            rating NUMERIC(3,1),
            orientation TEXT NOT NULL DEFAULT 'landscape',
            file_hash TEXT NOT NULL DEFAULT '',
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS series (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'series',
            title TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            mux_asset_id TEXT NOT NULL DEFAULT '',
            mux_playback_id TEXT NOT NULL DEFAULT '',
            mux_video_id TEXT NOT NULL DEFAULT '',
            movie_url TEXT NOT NULL DEFAULT '',
            stream_url TEXT NOT NULL DEFAULT '',
            thumbnail TEXT NOT NULL DEFAULT '',
            backdrop_url TEXT NOT NULL DEFAULT '',
            trailer TEXT NOT NULL DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 0,
            release_year INTEGER,
            release_date TIMESTAMPTZ,
            maturity_rating TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'Ongoing',
            total_seasons INTEGER NOT NULL DEFAULT 1,
            genres JSONB NOT NULL DEFAULT '[]'::jsonb,
            cast_members JSONB NOT NULL DEFAULT '[]'::jsonb,
            director TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT '',
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            subtitles JSONB NOT NULL DEFAULT '[]'::jsonb,
            episodes JSONB NOT NULL DEFAULT '[]'::jsonb,
            views INTEGER NOT NULL DEFAULT 0,
            featured BOOLEAN NOT NULL DEFAULT false,
            is_premium BOOLEAN NOT NULL DEFAULT false,
            plan TEXT NOT NULL DEFAULT 'free',
            rating NUMERIC(3,1),
            orientation TEXT NOT NULL DEFAULT 'landscape',
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`
          ALTER TABLE movies
            ADD COLUMN IF NOT EXISTS movie_url TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS stream_url TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
            ADD COLUMN IF NOT EXISTS release_date TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb
        `,
        sql`
          ALTER TABLE series
            ADD COLUMN IF NOT EXISTS mux_asset_id TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS mux_playback_id TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS mux_video_id TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS movie_url TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS stream_url TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
            ADD COLUMN IF NOT EXISTS release_date TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb
        `,
        sql`
          CREATE TABLE IF NOT EXISTS platform_settings (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS analytics_snapshots (
            id TEXT PRIMARY KEY,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            actor JSONB,
            action TEXT NOT NULL,
            target_id TEXT NOT NULL DEFAULT '',
            target_type TEXT NOT NULL DEFAULT '',
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS temp_subtitles (
            token TEXT PRIMARY KEY,
            vtt_content TEXT NOT NULL,
            lang TEXT NOT NULL DEFAULT 'en',
            label TEXT NOT NULL DEFAULT 'English',
            name TEXT NOT NULL DEFAULT '',
            uploaded_by TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`
          ALTER TABLE temp_subtitles
            ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS uploaded_by TEXT
        `,
        sql`
          CREATE TABLE IF NOT EXISTS users (
            uid TEXT PRIMARY KEY,
            email TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'pelanggan',
            plan TEXT NOT NULL DEFAULT 'free',
            is_active BOOLEAN NOT NULL DEFAULT true,
            expires_at TIMESTAMPTZ,
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
        sql`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
                AND column_default IS DISTINCT FROM '''pelanggan''::text'
            ) THEN
              ALTER TABLE users ALTER COLUMN role SET DEFAULT 'pelanggan';
            END IF;
          END $$
        `,
        sql`
          CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '',
            type TEXT NOT NULL DEFAULT 'info',
            read BOOLEAN NOT NULL DEFAULT false,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `,
        sql`CREATE INDEX IF NOT EXISTS idx_movies_created_at ON movies (created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_movies_updated_at ON movies (updated_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_movies_views ON movies (views DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_movies_category ON movies (category)`,
        sql`CREATE INDEX IF NOT EXISTS idx_movies_file_hash ON movies (file_hash)`,
        sql`CREATE INDEX IF NOT EXISTS idx_series_created_at ON series (created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_series_updated_at ON series (updated_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_series_views ON series (views DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_series_category ON series (category)`,
        sql`CREATE INDEX IF NOT EXISTS idx_temp_subtitles_expires_at ON temp_subtitles (expires_at)`,
        sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)`,
        sql`CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC)`,
      ]);

      return true;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
