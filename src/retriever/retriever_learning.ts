import { getLearningItemCollection } from "../core/collections/learning";

export async function retrieveLearning(query: string, k = 10) {
    const collection = await getLearningItemCollection();

    const results = await collection.query({
        nResults: k,
        queryTexts: [query]
    });

    return results;
}
