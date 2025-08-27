import { faker } from '@faker-js/faker';
import { z } from 'zod';

/** Generate a fake value that satisfies a Zod schema (works with Zod v3/v4 classic) */
export function fakeFromZod(schema: z.ZodTypeAny): any {
  const s = unwrap(schema);

  if (s instanceof z.ZodString) {
    const checks = (s as any)._def?.checks as Array<{ kind: string; value?: any }> | undefined;
    const kinds = new Set((checks ?? []).map(c => c.kind));
    if (kinds.has('uuid'))  return faker.datatype.uuid();
    if (kinds.has('email')) return faker.internet.email();
    if (kinds.has('url'))   return faker.internet.url();

    const min = (checks ?? []).find(c => c.kind === 'min')?.value ?? 6;
    const max = (checks ?? []).find(c => c.kind === 'max')?.value ?? 18;
    return faker.lorem.word(clamp(min, 6, max));
  }

  if (s instanceof z.ZodNumber) {
    const checks = (s as any)._def?.checks as Array<{ kind: string; value?: any }> | undefined;
    const min = (checks ?? []).find(c => c.kind === 'min')?.value ?? 0;
    const max = (checks ?? []).find(c => c.kind === 'max')?.value ?? 10_000;
    return faker.datatype.number({ min, max });
  }

  if (s instanceof z.ZodBoolean) return faker.datatype.boolean();

  if (s instanceof z.ZodEnum) {
    return faker.helpers.arrayElement(s.options);
  }

  if (s instanceof z.ZodLiteral) {
    return (s as z.ZodLiteral<any>).value;
  }

  if (s instanceof z.ZodArray) {
    const n = faker.datatype.number({ min: 1, max: 3 });
    const item = (s as z.ZodArray<any>).element;
    return Array.from({ length: n }, () => fakeFromZod(item));
  }

  if (s instanceof z.ZodObject) {
    const shape = getObjectShape(s);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(shape)) out[k] = fakeFromZod(v as z.ZodTypeAny);
    return out;
  }

  if (s instanceof z.ZodRecord) {
    const valueSchema = getRecordValueSchema(s);
    const n = faker.datatype.number({ min: 1, max: 3 });
    const o: Record<string, any> = {};
    for (let i = 0; i < n; i++) {
      o[faker.lorem.word()] = fakeFromZod(valueSchema);
    }
    return o;
  }

  if (s instanceof z.ZodUnion) {
    const options = (s as z.ZodUnion<any>).options;
    return fakeFromZod(faker.helpers.arrayElement(options));
  }

  if ((s as any)?._def?.typeName === 'ZodDiscriminatedUnion') {
    // v3/v4 discriminated union
    const options: any[] = Array.from(((s as any)._def?.options ?? (s as any).options)?.values?.() ?? []);
    return fakeFromZod(faker.helpers.arrayElement(options));
  }

  if (s instanceof z.ZodDate) return faker.date.recent();

  // Fallback
  return faker.lorem.word(12);
}

/** Robustly unwrap optional/nullable/default/effects/coerce to the inner schema */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s: any = schema;

  // optional()/nullable() expose .unwrap()
  while (typeof s?.unwrap === 'function') s = s.unwrap();

  // default() keeps inner at _def.innerType
  if (s?._def?.innerType) return unwrap(s._def.innerType);

  // effects/coerce/transform keep inner at _def.schema
  if (s?._def?.schema) return unwrap(s._def.schema);

  return s as z.ZodTypeAny;
}

/** Read object shape across Zod versions (v4 classic may use _def.shape()) */
function getObjectShape(obj: z.ZodObject<any>): Record<string, z.ZodTypeAny> {
  const defShape = (obj as any)._def?.shape;
  return typeof defShape === 'function' ? defShape() : ((obj as any).shape as Record<string, z.ZodTypeAny>);
}

/** Read record value schema across Zod versions (valueType/value/valueSchema) */
function getRecordValueSchema(rec: z.ZodRecord<any>): z.ZodTypeAny {
  const def = (rec as any)._def;
  return def?.valueType ?? def?.value ?? def?.valueSchema;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Build a small random Zod object (or from a provided partial shape) */
export function randomZodObject(fields?: Partial<Record<string, z.ZodTypeAny>>): z.ZodObject<any> {
  if (fields) return z.object(fields);
  const count = faker.datatype.number({ min: 1, max: 3 });
  const shape: Record<string, z.ZodTypeAny> = {};
  for (let i = 0; i < count; i++) {
    const name = faker.helpers.slugify(faker.word.noun()).replace(/-/g, '_');
    shape[name] = faker.helpers.arrayElement([
      z.string(),
      z.coerce.number().int().min(0).max(9999),
      z.coerce.boolean(),
    ]);
  }
  return z.object(shape);
}
