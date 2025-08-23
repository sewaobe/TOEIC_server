import { AsyncLocalStorage } from 'async_hooks';

// Định nghĩa kiểu cho context
interface RequestContext {
  [key: string]: any; // có thể lưu các key-value tùy ý
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// Set context cho request
export const setRequestContext = (data: RequestContext): void => {
  asyncLocalStorage.enterWith(data);
};

// Lấy context hiện tại
export const getRequestContext = (): RequestContext => {
  return asyncLocalStorage.getStore() || {};
};
