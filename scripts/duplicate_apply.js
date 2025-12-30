const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
if(!MONGO_URI){ console.error('MONGO_URI not found in .env'); process.exit(2); }

const previewFile = path.resolve(__dirname, '..', '..','toeic_server_export','duplicate_preview.json');
if(!fs.existsSync(previewFile)){ console.error('Preview file not found:', previewFile); process.exit(2); }
const preview = JSON.parse(fs.readFileSync(previewFile,'utf8'));

async function findCollectionName(db, modelName){
  const cols = await db.listCollections().toArray();
  const lname = modelName.toLowerCase();
  for(const c of cols){
    const n = c.name.toLowerCase();
    if(n===lname || n===lname+'s' || n.includes(lname)) return c.name;
  }
  return modelName;
}

function cloneDocForInsert(src, targetPart, marker){
  const copy = JSON.parse(JSON.stringify(src));
  delete copy._id;
  if(copy.part_type!==undefined) copy.part_type = Number(targetPart);
  else if(copy.part!==undefined) copy.part = Number(targetPart);
  else copy.part_type = Number(targetPart);
  copy.generated_by = marker;
  copy.source_original_id = src._id || src.id || null;
  return copy;
}

async function backupCollection(db, collName, outDir){
  const col = db.collection(collName);
  const all = await col.find({}).toArray();
  fs.writeFileSync(path.join(outDir,`${collName}_backup_before_dup.json`), JSON.stringify(all,null,2),'utf8');
  console.log('Backed up', collName, 'count=', all.length);
}

async function run(){
  await mongoose.connect(MONGO_URI, { dbName: new URL(MONGO_URI).pathname.replace('/','') });
  const db = mongoose.connection.db;
  const outDir = path.resolve(__dirname, '..', '..','toeic_server_export');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{ recursive:true });

  const marker = 'dup_script_20251220';
  const insertedLog = { generatedAt: new Date().toISOString(), marker, inserts: [] };

  for(const action of preview.actions){
    const modelName = action.collection;
    const collName = await findCollectionName(db, modelName);
    await backupCollection(db, collName, outDir);

    for(const plan of action.planned || []){
      const target = plan.targetPart;
      const items = plan.items || [];
      const batch = [];
      for(const it of items){
        const exportFile = path.resolve(__dirname, '..','..','toeic_server_export','toeic_activities_export.json');
        let original = null;
        if(fs.existsSync(exportFile)){
          const all = JSON.parse(fs.readFileSync(exportFile,'utf8'));
          const collSrc = all[modelName] || [];
          original = collSrc.find(x=>String(x._id)===String(it.originalId) || String(x.id)===String(it.originalId));
        }
        if(!original){
          console.warn('Original not found for', it.originalId, '— inserting minimal doc');
          original = { title: it.newDocSummary.title || '', part_type: target };
        }
        const doc = cloneDocForInsert(original, target, marker);
        batch.push(doc);
      }

      if(batch.length){
        const chunkSize = 50;
        for(let i=0;i<batch.length;i+=chunkSize){
          const chunk = batch.slice(i,i+chunkSize);
          const res = await db.collection(collName).insertMany(chunk);
          const ids = Object.values(res.insertedIds).map(String);
          insertedLog.inserts.push({ collection: collName, targetPart: target, insertedCount: ids.length, ids });
          console.log(`Inserted ${ids.length} into ${collName} part ${target}`);
        }
      }
    }
  }

  const logFile = path.join(outDir,'duplicates_inserted.json');
  fs.writeFileSync(logFile, JSON.stringify(insertedLog,null,2),'utf8');
  console.log('Insert log written:', logFile);
  await mongoose.disconnect();
}

run().catch(err=>{ console.error(err); process.exit(2); });
