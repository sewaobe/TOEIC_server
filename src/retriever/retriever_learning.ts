import { getLearningItemCollection } from "../core/collections/learning";

export async function retrieveLearning(query: string, k = 10, part_type: number) {
    const collection = await getLearningItemCollection();

    const results = await collection.query({
        nResults: k,
        queryTexts: [query],
        where: {
            part_type: part_type 
        }
    });

    return results;
}
