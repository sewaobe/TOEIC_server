/**
 * retriever_test.ts
 *
 * Query interface for test_items ChromaDB collection
 */

import { getTestItemCollection } from "../core/collections/test";
import { Test } from "../models/test.model";
import { Types } from "mongoose";

export interface TestQueryFilters {
  level?: string;
  status?: string;
  type?: string;
}

/**
 * Retrieve tests from ChromaDB using semantic search
 * @param query Search query
 * @param k Number of results to return
 * @param filters Optional metadata filters
 */
export async function retrieveTests(
  query: string,
  k: number = 10,
  filters?: TestQueryFilters
): Promise<{
  ids: string[][];
  distances: number[][];
  metadatas: any[][];
  documents: string[][];
}> {
  const collection = await getTestItemCollection();

  const where: any = {};
  if (filters?.level) where.level = filters.level;
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;

  const results = await collection.query({
    queryTexts: [query],
    nResults: k,
    ...(Object.keys(where).length > 0 ? { where } : {}),
  });

  return results;
}

/**
 * Get all tests from ChromaDB
 * @param limit Max number of results
 * @param filters Optional metadata filters
 */
export async function getAllTests(
  limit: number = 100,
  filters?: TestQueryFilters
): Promise<{
  ids: string[];
  metadatas: any[];
  documents: string[];
}> {
  const collection = await getTestItemCollection();

  const where: any = {};
  if (filters?.level) where.level = filters.level;
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;

  const results = await collection.get({
    limit,
    ...(Object.keys(where).length > 0 ? { where } : {}),
  });

  return results;
}

/**
 * Retrieve tests from ChromaDB and populate full Test documents from MongoDB
 * @param query Search query
 * @param k Number of results
 * @param filters Optional filters
 */
export async function retrieveTestsWithPopulate(
  query: string,
  k: number = 10,
  filters?: TestQueryFilters
): Promise<any[]> {
  const results = await retrieveTests(query, k, filters);

  if (!results.ids || !results.ids[0] || results.ids[0].length === 0) {
    console.log("⚠️ retrieveTestsWithPopulate: No tests found in ChromaDB");
    return [];
  }

  console.log(
    `🔍 Found ${results.ids[0].length} test IDs from ChromaDB:`,
    results.ids[0]
  );

  // Extract ObjectId từ format "test_xxx" hoặc dùng metadata.item_id
  const testIds = results.ids[0]
    .map((id: string, idx: number) => {
      try {
        // Ưu tiên dùng item_id từ metadata nếu có
        const itemId = results.metadatas?.[0]?.[idx]?.item_id;
        if (itemId) {
          return new Types.ObjectId(itemId);
        }
        // Fallback: extract từ format "test_xxx"
        const extractedId = id.startsWith("test_")
          ? id.replace("test_", "")
          : id;
        return new Types.ObjectId(extractedId);
      } catch (e) {
        console.warn(`⚠️ Invalid ObjectId: ${id}`);
        return null;
      }
    })
    .filter((id: any) => id !== null);

  if (testIds.length === 0) return [];

  // Không populate groups để tránh lỗi schema
  const tests = await Test.find({ _id: { $in: testIds } }).lean();

  return tests;
}

/**
 * Get all tests from ChromaDB and populate full Test documents from MongoDB
 * Sử dụng get() thay vì query() để tránh vấn đề embedding function
 * @param limit Max number of tests to retrieve
 * @param filters Optional filters
 */
export async function getAllTestsWithPopulate(
  limit: number = 50,
  filters?: TestQueryFilters
): Promise<any[]> {
  const results = await getAllTests(limit, filters);

  if (!results.ids || results.ids.length === 0) {
    console.log("⚠️ getAllTestsWithPopulate: No tests found in ChromaDB");
    return [];
  }

  console.log(`🔍 Found ${results.ids.length} test IDs from ChromaDB`);

  // Extract ObjectId từ metadata.item_id
  const testIds = results.ids
    .map((id: string, idx: number) => {
      try {
        // Ưu tiên dùng item_id từ metadata nếu có
        const itemId = results.metadatas?.[idx]?.item_id;
        if (itemId) {
          return new Types.ObjectId(itemId);
        }
        // Fallback: extract từ format "test_xxx"
        const extractedId = id.startsWith("test_")
          ? id.replace("test_", "")
          : id;
        return new Types.ObjectId(extractedId);
      } catch (e) {
        console.warn(`⚠️ Invalid ObjectId: ${id}`);
        return null;
      }
    })
    .filter((id: any) => id !== null);

  if (testIds.length === 0) return [];

  // Không populate groups để tránh lỗi schema
  const tests = await Test.find({ _id: { $in: testIds } }).lean();

  console.log(`✅ Populated ${tests.length} tests from MongoDB`);
  return tests;
}
