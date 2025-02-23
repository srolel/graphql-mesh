/* eslint-disable @typescript-eslint/no-misused-new */
import { IResolvers, Executor } from '@graphql-tools/utils';
import { GraphQLSchema, GraphQLResolveInfo, DocumentNode, SelectionSetNode } from 'graphql';
import * as YamlConfig from './config';
import {
  Transform,
  MergedTypeConfig,
  SubschemaConfig,
  IDelegateToSchemaOptions,
  CreateProxyingResolverFn,
} from '@graphql-tools/delegate';
import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { MeshStore } from '@graphql-mesh/store';
import configSchema from './config-schema.json';
import type { Plugin } from '@envelop/core';
import { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue';
import { BatchDelegateOptions } from '@graphql-tools/batch-delegate';

export const jsonSchema: any = configSchema;

export { YamlConfig };

export type MeshSource = {
  schema: GraphQLSchema;
  executor?: Executor;
  contextVariables?: Record<string, string>;
  batch?: boolean;
  merge?: Record<string, MergedTypeConfig>;
};

export interface KeyValueCacheSetOptions {
  /**
   * Specified in **seconds**, the time-to-live (TTL) value limits the lifespan
   * of the data being stored in the cache.
   */
  ttl?: number | null;
}
export interface KeyValueCache<V = any> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V, options?: KeyValueCacheSetOptions): Promise<void>;
  delete(key: string): Promise<boolean | void>;
  getKeysByPrefix(prefix: string): Promise<string[]>;
}

export type MeshHandlerOptions<THandlerConfig> = {
  name: string;
  config: THandlerConfig;
  baseDir: string;
  cache: KeyValueCache;
  pubsub: MeshPubSub;
  store: MeshStore;
  logger: Logger;
  importFn: ImportFn;
};

export type GetMeshSourcePayload = {
  fetchFn: MeshFetch;
};

// Handlers
export interface MeshHandler {
  getMeshSource: (payload: GetMeshSourcePayload) => Promise<MeshSource>;
}

export interface MeshHandlerLibrary<TConfig = any> {
  new (options: MeshHandlerOptions<TConfig>): MeshHandler;
}

// Hooks
export type AllHooks = {
  destroy: void;
  [key: string]: any;
};
export type HookName = keyof AllHooks & string;

export interface MeshPubSub {
  publish<THook extends HookName>(triggerName: THook, payload: AllHooks[THook]): void;
  subscribe<THook extends HookName>(
    triggerName: THook,
    onMessage: (data: AllHooks[THook]) => void,
    options?: any
  ): number;
  unsubscribe(subId: number): void;
  getEventNames(): Iterable<string>;
  asyncIterator<THook extends HookName>(triggers: THook): AsyncIterable<AllHooks[THook]>;
}

export interface MeshTransformOptions<Config = any> {
  apiName: string;
  config: Config;
  baseDir: string;
  cache: KeyValueCache;
  pubsub: MeshPubSub;
  importFn: ImportFn;
}

export interface MeshTransformLibrary<Config = any> {
  new (options: MeshTransformOptions<Config>): MeshTransform;
}

export interface MeshTransform<T = any> extends Transform<T> {
  noWrap?: boolean;
}

export type Maybe<T> = null | undefined | T;

export interface MeshMergerOptions {
  cache: KeyValueCache;
  pubsub: MeshPubSub;
  logger: Logger;
  store: MeshStore;
}

export interface MeshMergerLibrary {
  new (options: MeshMergerOptions): MeshMerger;
}

export interface MeshMergerContext {
  rawSources: RawSourceOutput[];
  typeDefs?: DocumentNode[];
  resolvers?: IResolvers | IResolvers[];
}

export interface MeshMerger {
  name: string;
  getUnifiedSchema(mergerContext: MeshMergerContext): SubschemaConfig | Promise<SubschemaConfig>;
}

export type MeshPluginOptions<TConfig> = TConfig & {
  logger: Logger;
  cache: KeyValueCache;
  pubsub: MeshPubSub;
  baseDir: string;
  importFn: ImportFn;
};

export type MeshPluginFactory<TConfig> = (options: MeshPluginOptions<TConfig>) => Plugin;

export type OnDelegateHookPayload<TContext> = Partial<BatchDelegateOptions<TContext>> &
  Partial<IDelegateToSchemaOptions<TContext>> & {
    sourceName: string;
    typeName: string;
    fieldName: string;
  };

export type OnDelegateHook<TContext> = (
  payload: OnDelegateHookPayload<TContext>
) => PromiseOrValue<OnDelegateHookDone | void>;

export type OnDelegateHookDonePayload = {
  result: any;
  setResult: (result: any) => void;
};

export type OnDelegateHookDone = (payload: OnDelegateHookDonePayload) => PromiseOrValue<void>;

export type MeshPlugin<TContext> = Plugin<TContext> & {
  onFetch?: OnFetchHook<TContext>;
  onDelegate?: OnDelegateHook<TContext>;
};

export type MeshFetch = (
  url: string,
  options?: RequestInit,
  context?: any,
  info?: GraphQLResolveInfo
) => Promise<Response>;

export interface OnFetchHookPayload<TContext> {
  url: string;
  options: RequestInit;
  context: TContext;
  info: GraphQLResolveInfo;
  fetchFn: MeshFetch;
  setFetchFn: (fetchFn: MeshFetch) => void;
}

export interface OnFetchHookDonePayload {
  response: Response;
  setResponse: (response: Response) => void;
}

export type OnFetchHookDone = (payload: OnFetchHookDonePayload) => PromiseOrValue<void>;

export type OnFetchHook<TContext> = (payload: OnFetchHookPayload<TContext>) => PromiseOrValue<void | OnFetchHookDone>;

export type RawSourceOutput = {
  name: string;
  schema: GraphQLSchema;
  executor?: Executor;
  transforms: MeshTransform[];
  contextVariables: Record<string, string>;
  handler: MeshHandler;
  batch: boolean;
  merge?: Record<string, MergedTypeConfig>;
  createProxyingResolver: CreateProxyingResolverFn<any>;
};

export type GraphQLOperation<TData, TVariables> = TypedDocumentNode<TData, TVariables> | string;

export type ImportFn = <T = any>(moduleId: string, noCache?: boolean) => Promise<T>;

export type LazyLoggerMessage = (() => any | any[]) | any;

export type Logger = {
  name?: string;
  log: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...lazyArgs: LazyLoggerMessage[]) => void;
  child: (name: string) => Logger;
};

export type SelectionSetParam = SelectionSetNode | DocumentNode | string | SelectionSetNode;
export type SelectionSetParamOrFactory = ((subtree: SelectionSetNode) => SelectionSetParam) | SelectionSetParam;

export type InContextSdkMethodBatchingParams<TDefaultReturn, TArgs, TKey, TReturn> = {
  key: TKey;
  argsFromKeys: (keys: TKey[]) => TArgs;
  valuesFromResults?: (results: TDefaultReturn, keys: TKey[]) => TReturn | TReturn[];
};

export type InContextSdkMethodRegularParams<TDefaultReturn, TArgs, TReturn> = {
  args?: TArgs;
  valuesFromResults?: (results: TDefaultReturn) => TReturn | TReturn[];
};

export type InContextSdkMethodCustomSelectionSetParams = {
  // Use this parameter if the selection set of the return type doesn't match
  selectionSet: SelectionSetParamOrFactory;
  info?: GraphQLResolveInfo;
};

export type InContextSdkMethodInfoParams = {
  info: GraphQLResolveInfo;
};

export type InContextSdkMethodParams<TDefaultReturn, TArgs, TContext, TKey, TReturn> = {
  root?: any;
  context: TContext;
} & (InContextSdkMethodCustomSelectionSetParams | InContextSdkMethodInfoParams) &
  (
    | InContextSdkMethodBatchingParams<TDefaultReturn, TArgs, TKey, TReturn>
    | InContextSdkMethodRegularParams<TDefaultReturn, TArgs, TReturn>
  );

export type InContextSdkMethod<TDefaultReturn = any, TArgs = any, TContext = any> = <TKey, TReturn = TDefaultReturn>(
  params: InContextSdkMethodParams<TDefaultReturn, TArgs, TContext, TKey, TReturn>
) => Promise<TReturn>;
