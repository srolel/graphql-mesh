import RenameTransform from './../src/index';
import { buildSchema, graphql, GraphQLObjectType, GraphQLNonNull, GraphQLScalarType } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import InMemoryLRUCache from '@graphql-mesh/cache-localforage';
import { ImportFn, MeshPubSub } from '@graphql-mesh/types';
import { PubSub } from '@graphql-mesh/utils';

describe('rename', () => {
  const schema = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        my_user: MyUser!
        my_book: MyBook!
        profile(profile_id: ID!, role: String): Profile
      }

      type MyUser {
        id: ID!
        name: String!
      }

      type Profile {
        id: ID!
        isActive: Boolean!
      }

      type MyBook {
        id: ID!
        hits: Int!
      }
    `,
    resolvers: {
      Query: { my_user: () => ({ id: 'userId' }), profile: (_, args) => ({ id: `profile_${args.profile_id}` }) },
    },
  });
  let cache: InMemoryLRUCache;
  let pubsub: MeshPubSub;
  const baseDir: string = undefined;
  const importFn: ImportFn = m => import(m);

  beforeEach(() => {
    cache = new InMemoryLRUCache();
    pubsub = new PubSub();
  });

  it('should change the name of a type', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'MyUser',
            },
            to: {
              type: 'User',
            },
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);

    expect(newSchema.getType('MyUser')).toBeUndefined();
    expect(newSchema.getType('User')).toBeDefined();
  });

  it('should change the name of a field', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'my_user',
            },
            to: {
              type: 'Query',
              field: 'user',
            },
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.my_user).toBeUndefined();
    expect(fieldMap.user).toBeDefined();
  });

  it('should resolve correctly renamed field', async () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'MyUser',
              field: 'id',
            },
            to: {
              type: 'MyUser',
              field: 'userId',
            },
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const transformedSchema = transform.transformSchema(schema, {} as any);
    const result = await graphql({
      schema: transformedSchema,
      source: /* GraphQL */ `
        {
          my_user {
            userId
          }
        }
      `,
    });

    expect(result.data).toMatchObject({ my_user: { userId: 'userId' } });
  });

  it('should change the name of multiple type names', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'My(.*)',
            },
            to: {
              type: '$1',
            },
            useRegExpForTypes: true,
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);

    expect(newSchema.getType('MyUser')).toBeUndefined();
    expect(newSchema.getType('User')).toBeDefined();
    expect(newSchema.getType('MyBook')).toBeUndefined();
    expect(newSchema.getType('Book')).toBeDefined();
  });

  it('should not rename default Scalar types', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: '(.*)',
            },
            to: {
              type: 'Prefixed_$1',
            },
            useRegExpForTypes: true,
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const userField = (newSchema.getType('Prefixed_MyUser') as GraphQLObjectType).getFields();
    const profileField = (newSchema.getType('Prefixed_Profile') as GraphQLObjectType).getFields();
    const bookField = (newSchema.getType('Prefixed_MyBook') as GraphQLObjectType).getFields();

    expect((userField.id.type as GraphQLNonNull<GraphQLScalarType>).ofType.toString()).toBe('ID');
    expect((userField.name.type as GraphQLNonNull<GraphQLScalarType>).ofType.toString()).toBe('String');

    expect((profileField.id.type as GraphQLNonNull<GraphQLScalarType>).ofType.toString()).toBe('ID');
    expect((profileField.isActive.type as GraphQLNonNull<GraphQLScalarType>).ofType.toString()).toBe('Boolean');

    expect((bookField.id.type as GraphQLNonNull<GraphQLScalarType>).ofType.toString()).toBe('ID');
    expect((bookField.hits.type as GraphQLNonNull<GraphQLScalarType>).ofType.toString()).toBe('Int');
  });

  it('should change the name of multiple fields', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'my_(.*)',
            },
            to: {
              type: 'Query',
              field: '$1',
            },
            useRegExpForFields: true,
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.my_user).toBeUndefined();
    expect(fieldMap.user).toBeDefined();
    expect(fieldMap.my_book).toBeUndefined();
    expect(fieldMap.book).toBeDefined();
  });

  it('should replace the first occurrence of a substring in a field', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'o(.*)',
            },
            to: {
              type: 'Query',
              field: '$1',
            },
            useRegExpForFields: true,
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.my_book).toBeUndefined();
    expect(fieldMap.my_bok).toBeDefined();
  });

  it('should replace all occurrences of a substring in a type', () => {
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        api_user_v1_api: ApiUserV1Api!
      }

      type ApiUserV1Api {
        id: ID!
      }
    `);

    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Api(.*?)',
            },
            to: {
              type: '$1',
            },
            useRegExpForTypes: true,
            regExpFlags: 'g',
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    expect(newSchema.getType('ApiUserV1Api')).toBeUndefined();
    expect(newSchema.getType('UserV1')).toBeDefined();
  });

  it('should replace all occurrences of multiple substrings in a type', () => {
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        api_user_v1_api: ApiUserV1Api!
      }

      type ApiUserV1Api {
        id: ID!
      }
    `);

    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Api|V1(.*?)',
            },
            to: {
              type: '$1',
            },
            useRegExpForTypes: true,
            regExpFlags: 'g',
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    expect(newSchema.getType('ApiUserV1Api')).toBeUndefined();
    expect(newSchema.getType('User')).toBeDefined();
  });

  it('should replace all occurrences of a substring in a field', () => {
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        api_user_v1_api: ApiUserV1Api!
      }

      type ApiUserV1Api {
        id: ID!
      }
    `);

    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'api_|_api(.*?)',
            },
            to: {
              type: 'Query',
              field: '$1',
            },
            useRegExpForFields: true,
            regExpFlags: 'g',
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.api_user_v1_api).toBeUndefined();
    expect(fieldMap.user_v1).toBeDefined();
  });

  it('should replace all occurrences of multiple substrings in a field', () => {
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        api_user_v1_api: ApiUserV1Api!
      }

      type ApiUserV1Api {
        id: ID!
      }
    `);

    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'api_|_api|v1_|_v1(.*?)',
            },
            to: {
              type: 'Query',
              field: '$1',
            },
            useRegExpForFields: true,
            regExpFlags: 'g',
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.api_user_v1_api).toBeUndefined();
    expect(fieldMap.user).toBeDefined();
  });

  it('should only affect specified type', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'o(.*)',
            },
            to: {
              type: 'Query',
              field: '$1',
            },
            useRegExpForFields: true,
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.my_book).toBeUndefined();
    expect(fieldMap.my_bok).toBeDefined();

    const myUserType = newSchema.getType('MyUser') as GraphQLObjectType;
    const myUserFields = myUserType.getFields();

    expect(myUserFields.id).toBeDefined();

    const myBookType = newSchema.getType('MyBook') as GraphQLObjectType;
    const myBookFields = myBookType.getFields();

    expect(myBookFields.id).toBeDefined();
  });

  it('should only affect specified field argument', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'profile',
              argument: 'profile_id',
            },
            to: {
              type: 'Query',
              field: 'profile',
              argument: 'profileId',
            },
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.profile.args.find(a => a.name === 'role')).toBeDefined();
    expect(fieldMap.profile.args.find(a => a.name === 'profile_id')).toBeUndefined();
    expect(fieldMap.profile.args.find(a => a.name === 'profileId')).toBeDefined();
  });

  it('should resolve correctly field with renamed argument', async () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              type: 'Query',
              field: 'profile',
              argument: 'profile_id',
            },
            to: {
              type: 'Query',
              field: 'profile',
              argument: 'profileId',
            },
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn,
    });

    const transformedSchema = transform.transformSchema(schema, {} as any);
    const result = await graphql({
      schema: transformedSchema,
      source: /* GraphQL */ `
        {
          profile(profileId: "abc123") {
            id
          }
        }
      `,
    });

    expect(result.data).toMatchObject({ profile: { id: 'profile_abc123' } });
  });

  it('should only affect field argument only if type and field are specified', () => {
    const transform = new RenameTransform({
      config: {
        mode: 'bare',
        renames: [
          {
            from: {
              argument: 'profile_id',
            },
            to: {
              argument: 'profileId',
            },
          },
        ],
      },
      apiName: '',
      cache,
      pubsub,
      baseDir,
      importFn: m => import(m),
    });

    const newSchema = transform.transformSchema(schema, {} as any);
    const queryType = newSchema.getType('Query') as GraphQLObjectType;
    const fieldMap = queryType.getFields();

    expect(fieldMap.profile.args.find(a => a.name === 'role')).toBeDefined();
    expect(fieldMap.profile.args.find(a => a.name === 'profile_id')).toBeDefined();
    expect(fieldMap.profile.args.find(a => a.name === 'profileId')).toBeUndefined();
  });
});
