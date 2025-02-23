import { memoize2 } from '@graphql-tools/utils';
import { JSONSchema, resolvePath } from 'json-machete';
import Ajv, { ValidateFunction } from 'ajv';

const ajvMemoizedCompile = memoize2(function ajvCompile(ajv: Ajv, jsonSchema: JSONSchema) {
  const schema: any =
    typeof jsonSchema === 'object'
      ? {
          ...jsonSchema,
          $schema: undefined,
        }
      : jsonSchema;
  try {
    return ajv.compile(schema);
  } catch {
    // eslint-disable-next-line no-inner-declarations
    function validateFn(value: string) {
      return ajv.validate(schema, value);
    }
    Object.defineProperty(validateFn, 'errors', {
      get() {
        return ajv.errors;
      },
    });
    return validateFn as ValidateFunction;
  }
});

export function getValidateFnForSchemaPath(ajv: Ajv, path: string, schema: JSONSchema) {
  const subSchema = resolvePath(path, schema);
  const fn = function validateFn(data: any) {
    const ajvValidateFn = ajvMemoizedCompile(ajv, subSchema);
    return ajvValidateFn(data);
  };
  Object.defineProperty(fn, 'errors', {
    get() {
      return ajvMemoizedCompile(ajv, subSchema).errors;
    },
  });
  return fn;
}
