import { z } from 'zod';
export const positiveDecimal = z.string().regex(/^\d+(\.\d+)?$/).refine(s => /[1-9]/.test(s));
export const actionSchema = z.object({
  eventId: z.string().min(1), version: z.number().int().nonnegative(),
  xstockSymbol: z.string().nullable(), caType: z.string(),
  effectiveTimeUtc: z.string().datetime().nullable(),
  multiplierOld: positiveDecimal.nullable(), multiplierNew: positiveDecimal.nullable(),
  status: z.enum(['Initial', 'Corrected', 'Cancelled', 'Scheduled']),
  createdTimeUtc: z.string().datetime(),
});
export type CorporateAction = z.infer<typeof actionSchema>;
export const actionPageSchema = z.object({
  nodes: z.array(actionSchema),
  page: z.object({currentPage: z.number().int(), hasNextPage: z.boolean()}),
});
