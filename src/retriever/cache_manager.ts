import fs from "fs";
const CACHE_FILE = "cache.json";

interface CacheData {
    [question: string]: string;
}

export function getCache(q: string): string | null {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data: CacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return data[q] || null;
}

export function saveCache(q: string, context: string) {
    let data: CacheData = {};
    if (fs.existsSync(CACHE_FILE))
        data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    data[q] = context;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}
