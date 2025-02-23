import JsonPointer from 'json-pointer';
import { path as pathModule, process } from '@graphql-mesh/cross-helpers';
import urlJoin from 'url-join';
import { fetch as crossUndiciFetch } from '@whatwg-node/fetch';
import { defaultImportFn, DefaultLogger, readFileOrUrl } from '@graphql-mesh/utils';
import { handleUntitledDefinitions } from './healUntitledDefinitions';

export const resolvePath = (path: string, root: any): any => {
  try {
    return JsonPointer.get(root, path);
  } catch (e) {
    if (e.message?.startsWith('Invalid reference')) {
      return undefined;
    }
    throw e;
  }
};
function isRefObject(obj: any): obj is { $ref: string } {
  return typeof obj === 'object' && typeof obj.$ref === 'string';
}

function isURL(str: string) {
  return /^https?:\/\//.test(str);
}

const getAbsolute$Ref = (given$ref: string, baseFilePath: string) => {
  const [givenExternalFileRelativePath, givenRefPath] = given$ref.split('#');
  if (givenExternalFileRelativePath) {
    const cwd = isURL(baseFilePath) ? getCwdForUrl(baseFilePath) : pathModule.dirname(baseFilePath);
    const givenExternalFilePath = getAbsolutePath(givenExternalFileRelativePath, cwd);
    if (givenRefPath) {
      return `${givenExternalFilePath}#${givenRefPath}`;
    }
    return givenExternalFilePath;
  }
  return `${baseFilePath}#${givenRefPath}`;
};

function getCwdForUrl(url: string) {
  const urlParts = url.split('/');
  urlParts.pop();
  return urlParts.join('/');
}

function normalizeUrl(url: string) {
  return new URL(url).toString();
}

export function getAbsolutePath(path: string, cwd: string) {
  if (isURL(path)) {
    return path;
  }
  if (isURL(cwd)) {
    return normalizeUrl(urlJoin(cwd, path));
  }
  if (pathModule.isAbsolute(path)) {
    return path;
  }
  return pathModule.join(cwd, path);
}

export function getCwd(path: string) {
  return isURL(path) ? getCwdForUrl(path) : pathModule.dirname(path);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export async function dereferenceObject<T extends object, TRoot = T>(
  obj: T,
  {
    cwd = process.cwd(),
    externalFileCache = new Map<string, any>(),
    refMap = new Map<string, any>(),
    root = obj as any,
    fetchFn: fetch = crossUndiciFetch,
    importFn = defaultImportFn,
    logger = new DefaultLogger('dereferenceObject'),
    resolvedObjects = new WeakSet(),
    headers,
  }: {
    cwd?: string;
    externalFileCache?: Map<string, any>;
    refMap?: Map<string, any>;
    root?: TRoot;
    fetchFn?: WindowOrWorkerGlobalScope['fetch'];
    importFn?: (m: string) => any;
    logger?: any;
    resolvedObjects?: WeakSet<any>;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  if (obj != null && typeof obj === 'object') {
    if (isRefObject(obj)) {
      const $ref = obj.$ref;
      if (refMap.has($ref)) {
        return refMap.get($ref);
      } else {
        logger.debug(`Resolving ${$ref}`);
        const [externalRelativeFilePath, refPath] = $ref.split('#');
        if (externalRelativeFilePath) {
          const externalFilePath = getAbsolutePath(externalRelativeFilePath, cwd);
          const newCwd = getCwd(externalFilePath);
          let externalFile = externalFileCache.get(externalFilePath);
          if (!externalFile) {
            externalFile = await readFileOrUrl(externalFilePath, {
              fetch,
              headers,
              cwd,
              importFn,
              logger,
            }).catch(() => {
              throw new Error(`Unable to load ${externalRelativeFilePath} from ${cwd}`);
            });
            externalFileCache.set(externalFilePath, externalFile);

            // Title should not be overwritten by the title given from the reference
            // Usually Swagger and OpenAPI Schemas have this
            handleUntitledDefinitions(externalFile);
          }
          const result = await dereferenceObject(
            refPath
              ? {
                  $ref: `#${refPath}`,
                }
              : externalFile,
            {
              cwd: newCwd,
              externalFileCache,
              refMap: new Proxy(refMap, {
                get: (originalRefMap, key) => {
                  switch (key) {
                    case 'has':
                      return (given$ref: string) => {
                        const original$Ref = getAbsolute$Ref(given$ref, externalFilePath);
                        return originalRefMap.has(original$Ref);
                      };
                    case 'get':
                      return (given$ref: string) => {
                        const original$Ref = getAbsolute$Ref(given$ref, externalFilePath);
                        return originalRefMap.get(original$Ref);
                      };
                    case 'set':
                      return (given$ref: string, val: any) => {
                        const original$Ref = getAbsolute$Ref(given$ref, externalFilePath);
                        return originalRefMap.set(original$Ref, val);
                      };
                  }
                  throw new Error('Not implemented ' + key.toString());
                },
              }),
              fetchFn: fetch,
              importFn,
              logger,
              headers,
              root: externalFile,
              resolvedObjects,
            }
          );
          refMap.set($ref, result);
          resolvedObjects.add(result);
          if (result && !result.$resolvedRef) {
            result.$resolvedRef = refPath;
          }
          if ((obj as any).title && !result.title) {
            result.title = (obj as any).title;
          }
          return result;
        } else {
          const resolvedObj = resolvePath(refPath, root);
          if (resolvedObjects.has(resolvedObj)) {
            refMap.set($ref, resolvedObj);
            return resolvedObj;
          }
          /*
          if (resolvedObj && !resolvedObj.$resolvedRef) {
            resolvedObj.$resolvedRef = refPath;
          }
          */
          const result = await dereferenceObject(resolvedObj, {
            cwd,
            externalFileCache,
            refMap,
            root,
            fetchFn: fetch,
            importFn,
            logger,
            headers,
            resolvedObjects,
          });
          if (!result) {
            return obj;
          }
          resolvedObjects.add(result);
          refMap.set($ref, result);
          if (!result.$resolvedRef) {
            result.$resolvedRef = refPath;
          }
          return result;
        }
      }
    } else {
      if (!resolvedObjects.has(obj)) {
        resolvedObjects.add(obj);
        for (const key in obj) {
          const val = obj[key];
          if (typeof val === 'object') {
            obj[key] = await dereferenceObject<any>(val, {
              cwd,
              externalFileCache,
              refMap,
              root,
              fetchFn: fetch,
              headers,
              resolvedObjects,
            });
          }
        }
      }
    }
  }
  return obj;
}
