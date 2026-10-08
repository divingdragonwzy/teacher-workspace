import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
fs.mkdirSync('.sites-runtime',{recursive:true});
fs.writeFileSync('.sites-runtime/wrangler.local.json',JSON.stringify({name:'english-bank-local',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:'../drizzle'}],r2_buckets:[{binding:'FILES',bucket_name:'site-creator-r2'}]},null,2));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','.sites-runtime/wrangler.local.json','--persist-to','.wrangler/state'],{stdio:'inherit'});
process.exit(result.status??1);
