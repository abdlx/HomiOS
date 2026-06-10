/**
 * First-class 1-click App Store catalog (the CasaOS/Umbrel-style feature).
 *
 * Unlike the old approach (3 compose templates hard-coded in the React
 * component, with passwords generated in the browser), the catalog lives
 * server-side and instantiate() generates strong secrets with crypto at
 * creation time and bakes them into the stored config ONCE — so redeploys keep
 * the same credentials. {{DOMAIN}} / {{APP_ID}} are left for the engine to fill.
 */
import crypto from 'crypto';

export type CatalogInput = { name: string; domains?: string };

export type InstantiatedApp = {
  name: string;
  build_pack: 'dockerimage' | 'database' | 'dockercompose' | 'github';
  docker_image?: string | null;
  docker_image_tag?: string | null;
  compose_content?: string | null;
  ports?: string | null;
  env_vars?: string | null;
  domains?: string | null;
  volumes?: string | null;
  cpu_limit?: string | null;
  mem_limit?: string | null;
};

export type CatalogEntry = {
  id: string;
  name: string;
  description: string;
  category: 'Productivity' | 'Media' | 'Developer' | 'Database' | 'Analytics' | 'Networking' | 'Security';
  icon: string; // emoji — keeps the catalog dependency-free
  tags: string[];
  needsDomain: boolean;
  instantiate: (o: CatalogInput) => InstantiatedApp;
};

const secret = (bytes = 18) => crypto.randomBytes(bytes).toString('hex');

export const CATALOG: CatalogEntry[] = [
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Self-hosted files, photos, calendar and contacts — your own cloud.',
    category: 'Productivity', icon: '☁️', tags: ['files', 'cloud', 'sync'], needsDomain: true,
    instantiate: () => {
      const dbpw = secret();
      return {
        name: 'nextcloud', build_pack: 'dockercompose',
        compose_content: `services:
  app:
    image: nextcloud:apache
    restart: unless-stopped
    environment:
      MYSQL_HOST: db
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: ${dbpw}
      NEXTCLOUD_TRUSTED_DOMAINS: "{{DOMAIN}}"
    volumes: [nextcloud_data:/var/www/html]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{{APP_ID}}.rule=Host(\`{{DOMAIN}}\`)"
      - "traefik.http.services.{{APP_ID}}.loadbalancer.server.port=80"
    networks: [openfinder-proxy, internal]
  db:
    image: mariadb:10.11
    restart: unless-stopped
    command: --transaction-isolation=READ-COMMITTED --binlog-format=ROW
    environment:
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: ${dbpw}
      MYSQL_RANDOM_ROOT_PASSWORD: '1'
    volumes: [nextcloud_db:/var/lib/mysql]
    networks: [internal]
volumes:
  nextcloud_data:
  nextcloud_db:
networks:
  openfinder-proxy: { external: true }
  internal: {}`,
      };
    },
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'The world\'s most popular CMS, with a managed MySQL database.',
    category: 'Productivity', icon: '📝', tags: ['blog', 'cms'], needsDomain: true,
    instantiate: () => {
      const dbpw = secret();
      return {
        name: 'wordpress', build_pack: 'dockercompose',
        compose_content: `services:
  wordpress:
    image: wordpress:latest
    restart: unless-stopped
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wp
      WORDPRESS_DB_PASSWORD: ${dbpw}
      WORDPRESS_DB_NAME: wp
    volumes: [wp_data:/var/www/html]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{{APP_ID}}.rule=Host(\`{{DOMAIN}}\`)"
      - "traefik.http.services.{{APP_ID}}.loadbalancer.server.port=80"
    networks: [openfinder-proxy, internal]
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: wp
      MYSQL_USER: wp
      MYSQL_PASSWORD: ${dbpw}
      MYSQL_RANDOM_ROOT_PASSWORD: '1'
    volumes: [wp_db:/var/lib/mysql]
    networks: [internal]
volumes:
  wp_data:
  wp_db:
networks:
  openfinder-proxy: { external: true }
  internal: {}`,
      };
    },
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Modern publishing platform for blogs and newsletters.',
    category: 'Productivity', icon: '👻', tags: ['blog', 'cms', 'newsletter'], needsDomain: true,
    instantiate: () => {
      const dbpw = secret();
      return {
        name: 'ghost', build_pack: 'dockercompose',
        compose_content: `services:
  ghost:
    image: ghost:5-alpine
    restart: unless-stopped
    environment:
      database__client: mysql
      database__connection__host: db
      database__connection__user: ghost
      database__connection__password: ${dbpw}
      database__connection__database: ghost
      url: https://{{DOMAIN}}
    volumes: [ghost_data:/var/lib/ghost/content]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{{APP_ID}}.rule=Host(\`{{DOMAIN}}\`)"
      - "traefik.http.services.{{APP_ID}}.loadbalancer.server.port=2368"
    networks: [openfinder-proxy, internal]
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: ${dbpw}
      MYSQL_RANDOM_ROOT_PASSWORD: '1'
    volumes: [ghost_db:/var/lib/mysql]
    networks: [internal]
volumes:
  ghost_data:
  ghost_db:
networks:
  openfinder-proxy: { external: true }
  internal: {}`,
      };
    },
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Workflow automation — connect anything to everything.',
    category: 'Developer', icon: '🔗', tags: ['automation', 'workflows', 'low-code'], needsDomain: true,
    instantiate: () => ({
      name: 'n8n', build_pack: 'dockerimage',
      docker_image: 'docker.n8n.io/n8nio/n8n', docker_image_tag: 'latest',
      env_vars: 'N8N_HOST={{DOMAIN}}\nN8N_PROTOCOL=https\nWEBHOOK_URL=https://{{DOMAIN}}/',
      volumes: 'n8n_data:/home/node/.n8n', ports: '5678:5678',
    }),
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Beautiful self-hosted uptime monitoring and status pages.',
    category: 'Networking', icon: '📈', tags: ['monitoring', 'status'], needsDomain: true,
    instantiate: () => ({
      name: 'uptime-kuma', build_pack: 'dockerimage',
      docker_image: 'louislam/uptime-kuma', docker_image_tag: '1',
      volumes: 'uptime_kuma:/app/data', ports: '3001:3001',
    }),
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Lightweight Bitwarden-compatible password manager server.',
    category: 'Security', icon: '🔐', tags: ['passwords', 'bitwarden'], needsDomain: true,
    instantiate: () => ({
      name: 'vaultwarden', build_pack: 'dockerimage',
      docker_image: 'vaultwarden/server', docker_image_tag: 'latest',
      env_vars: `ADMIN_TOKEN=${secret(24)}\nDOMAIN=https://{{DOMAIN}}`,
      volumes: 'vaultwarden_data:/data', ports: '8000:80',
    }),
  },
  {
    id: 'plausible',
    name: 'Plausible',
    description: 'Privacy-friendly, lightweight web analytics.',
    category: 'Analytics', icon: '📊', tags: ['analytics', 'privacy'], needsDomain: true,
    instantiate: () => ({
      name: 'plausible', build_pack: 'dockerimage',
      docker_image: 'plausible/analytics', docker_image_tag: 'latest',
      env_vars: `BASE_URL=https://{{DOMAIN}}\nSECRET_KEY_BASE=${secret(32)}`,
      ports: '8000:8000',
    }),
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'The advanced open-source relational database (v16).',
    category: 'Database', icon: '🐘', tags: ['database', 'sql'], needsDomain: false,
    instantiate: () => ({
      name: 'postgres', build_pack: 'database',
      docker_image: 'postgres', docker_image_tag: '16',
      env_vars: `POSTGRES_USER=admin\nPOSTGRES_PASSWORD=${secret()}`,
      volumes: 'postgres_data:/var/lib/postgresql/data', ports: '5432:5432',
    }),
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'In-memory data store for caching and queues (v7).',
    category: 'Database', icon: '🧱', tags: ['cache', 'kv'], needsDomain: false,
    instantiate: () => ({
      name: 'redis', build_pack: 'database',
      docker_image: 'redis', docker_image_tag: '7',
      volumes: 'redis_data:/data', ports: '6379:6379',
    }),
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'The popular open-source relational database (v8).',
    category: 'Database', icon: '🐬', tags: ['database', 'sql'], needsDomain: false,
    instantiate: () => ({
      name: 'mysql', build_pack: 'database',
      docker_image: 'mysql', docker_image_tag: '8',
      env_vars: `MYSQL_ROOT_PASSWORD=${secret()}\nMYSQL_DATABASE=db`,
      volumes: 'mysql_data:/var/lib/mysql', ports: '3306:3306',
    }),
  },
];

export function getCatalog() {
  // public metadata only (no secrets — those are minted at instantiate time)
  return CATALOG.map(({ instantiate, ...meta }) => meta);
}

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.id === id);
}
