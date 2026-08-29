import {type CursorParams} from "@/lib/api";

export interface BaseStore<T, P> {
  data: T | null;
  update: (newData: Partial<T>) => void;

  params: P;
  updateParams: (newParams: Partial<P>, options?: { autoFetch?: boolean }) => void;

  fetch: (options?: {
    throwError?: boolean;
    ignoreLoading?: boolean;
  }) => Promise<void>;
  clearData: () => void;

  loading: boolean;

  error?: string;
  clearError: () => void;

  clear: () => void;
}



export interface ListStore<T, P> {
  data: T[];
  add: (item: T) => void;
  update: (id: string, newData: Partial<T>) => void;
  delete: (id: string) => void;
  count: () => number;

  params: P;
  updateParams: (newParams: Partial<P>, options?: { autoFetch?: boolean }) => void;

  fetch: (options?: {
    throwError?: boolean;
    ignoreLoading?: boolean;
  }) => Promise<void>;
  clearData: () => void;

  loading: boolean;

  error?: string;
  clearError: () => void;

  clear: () => void;
}

export interface PaginatedStore<T, P extends CursorParams> {
  data: T[];
  add: (item: T) => void;
  update: (id: string, newData: Partial<T>) => void;
  delete: (id: string) => void;
  count: () => number;

  params: Omit<P, 'cursor' | 'idAfter'>;
  updateParams: (newParams: Partial<Omit<P, 'cursor' | 'idAfter'>>, options?: { autoFetch?: boolean }) => void;

  cursorState: CursorState;
  hasNext: () => boolean;

  fetch: (options?: {
    throwError?: boolean;
    ignoreLoading?: boolean;
  }) => Promise<void>;
  fetchMore: (options?: {
    throwError?: boolean;
    ignoreLoading?: boolean;
  }) => Promise<void>;
  clearData: () => void;

  loading: boolean;

  error?: string;
  clearError: () => void;

  clear: () => void;
}

export interface CursorState {
  nextCursor?: string;
  nextIdAfter?: string;
  hasNext: boolean;
  totalCount: number;
  /** 알림 목록 응답에서만 제공되는 미읽음 개수입니다. */
  unreadCount?: number;
}
