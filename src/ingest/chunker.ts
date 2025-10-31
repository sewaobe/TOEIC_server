export function chunkText(text: string, maxLength = 400, overlap = 50): string[] {
    const words = text.split(" ");
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += maxLength - overlap) {
        chunks.push(words.slice(i, i + maxLength).join(" "));
    }
    return chunks;
}
