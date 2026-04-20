import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1).max(500);

const optionalString = z.string().trim().max(2000).optional();

// URL fields must be http(s) when provided
const urlString = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (val) => {
      if (!val) return true;
      try {
        const normalized = /^https?:\/\//i.test(val) ? val : `https://${val}`;
        const url = new URL(normalized);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid HTTP or HTTPS URL' }
  )
  .optional();

const numericOrNull = z.union([z.number(), z.string(), z.null()]).transform((value) => {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
});

const leadBaseSchema = z
  .object({
    company_name: nonEmptyString,
    website_url: urlString,
    industry: optionalString,
    company_size: numericOrNull.optional(),
    country: optionalString,
    contact_name: optionalString,
    contact_role: optionalString,
    contact_email: optionalString,
    source_list: optionalString,
  })
  .passthrough();

const leadCreateSchema = leadBaseSchema.partial({
  company_name: false,
});

const leadImportRowSchema = leadBaseSchema.partial({
  company_name: false,
});

const leadImportSchema = z.object({
  rows: z.array(leadImportRowSchema).max(5000),
});

const leadPatchSchema = z.object({
  company_name: z.string().trim().min(1).max(500).optional(),
  website_url: z.string().trim().max(2000).optional(),
  industry: z.string().trim().max(200).optional(),
  company_size: numericOrNull.optional(),
  country: z.string().trim().max(100).optional(),
  contact_name: z.string().trim().max(300).optional(),
  contact_role: z.string().trim().max(300).optional(),
  contact_email: z.string().trim().max(500).optional(),
  source_list: z.string().trim().max(500).optional(),
  status: z.string().trim().max(100).optional(),
  follow_up_status: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(10000).optional(),
  intent_signals: z
    .object({
      pre_call: z.array(z.string().trim().min(1).max(200)).optional(),
      post_contact: z.array(z.string().trim().min(1).max(200)).optional(),
      negative: z.array(z.string().trim().min(1).max(200)).optional(),
    })
    .passthrough()
    .optional(),
  internet_signals: z
    .array(
      z
        .object({
          key: z.string().trim().min(1).max(200),
          evidence: z.string().trim().max(2000).optional(),
          confidence: z.union([z.number(), z.string()]).optional(),
          source_type: z.string().trim().max(100).optional(),
          found_at: z.string().trim().max(100).optional(),
        })
        .passthrough()
    )
    .max(200)
    .optional(),
  icp_score: numericOrNull.optional(),
  icp_raw_score: numericOrNull.optional(),
  icp_category: z.string().trim().max(120).optional(),
  icp_priority: numericOrNull.optional(),
  recommended_action: z.string().trim().max(300).optional(),
  icp_profile_id: z.string().trim().max(200).optional(),
  icp_profile_name: z.string().trim().max(500).optional(),
  analysis_version: z.string().trim().max(200).optional(),
  ai_score: numericOrNull.optional(),
  ai_confidence: numericOrNull.optional(),
  ai_signals: z.array(z.any()).max(500).optional(),
  ai_summary: z.string().trim().max(10000).optional(),
  scoring_weights: z.record(z.any()).optional(),
  final_score: numericOrNull.optional(),
  final_category: z.string().trim().max(120).optional(),
  final_priority: numericOrNull.optional(),
  final_recommended_action: z.string().trim().max(300).optional(),
  final_status: z.string().trim().max(120).optional(),
  signals: z.array(z.any()).max(1000).optional(),
  score_details: z.record(z.any()).optional(),
  analysis_summary: z.string().trim().max(20000).optional(),
  generated_icebreakers: z
    .object({
      email: z.string().trim().max(10000).optional(),
      linkedin: z.string().trim().max(5000).optional(),
      call: z.string().trim().max(5000).optional(),
    })
    .passthrough()
    .optional(),
  generated_icebreaker: z.string().trim().max(10000).optional(),
  llm_enriched: z.boolean().optional(),
  llm_provider: z.string().trim().max(120).optional(),
  llm_score_adjustment: numericOrNull.optional(),
  llm_confidence: numericOrNull.optional(),
  suggested_action: z.string().trim().max(500).optional(),
  last_analyzed_at: z.string().trim().max(120).optional(),
  auto_signal_metadata: z.record(z.any()).optional(),
});

const scoreMapSchema = z.object({
  parfait: z.number().optional(),
  partiel: z.number().optional(),
  aucun: z.number().optional(),
  exclu: z.number().optional(),
});

const thresholdSchema = z.object({
  excellent: z.number().optional(),
  strong: z.number().optional(),
  medium: z.number().optional(),
});

const icpWeightsSchema = z
  .object({
    industrie: z
      .object({
        primaires: z.array(z.string()).default([]),
        secondaires: z.array(z.string()).default([]),
        exclusions: z.array(z.string()).default([]),
        weight: z.number().min(0).max(300).optional(),
        scores: scoreMapSchema.optional(),
      })
      .optional(),
    roles: z
      .object({
        exacts: z.array(z.string()).default([]),
        proches: z.array(z.string()).default([]),
        exclusions: z.array(z.string()).default([]),
        weight: z.number().min(0).max(300).optional(),
        scores: scoreMapSchema.optional(),
      })
      .optional(),
    typeClient: z
      .object({
        primaire: z.array(z.string()).default([]),
        secondaire: z.array(z.string()).default([]),
        weight: z.number().min(0).max(300).optional(),
        scores: scoreMapSchema.optional(),
      })
      .optional(),
    structure: z
      .object({
        primaire: z.object({ min: z.number(), max: z.number() }).optional(),
        secondaire: z.object({ min: z.number(), max: z.number() }).optional(),
        weight: z.number().min(0).max(300).optional(),
        scores: scoreMapSchema.optional(),
      })
      .optional(),
    geo: z
      .object({
        primaire: z.array(z.string()).default([]),
        secondaire: z.array(z.string()).default([]),
        weight: z.number().min(0).max(300).optional(),
        scores: scoreMapSchema.optional(),
      })
      .optional(),
    meta: z
      .object({
        minScore: z.number().optional(),
        maxScore: z.number().optional(),
        finalScoreWeights: z
          .object({
            icp: z.number().optional(),
            ai: z.number().optional(),
          })
          .optional(),
        icpThresholds: thresholdSchema.optional(),
        finalThresholds: thresholdSchema.optional(),
        thresholds: z
          .object({
            icp: thresholdSchema.optional(),
            final: thresholdSchema.optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

const icpActiveSchema = z
  .object({
    id: z.string().trim().optional(),
    name: nonEmptyString,
    description: z.string().trim().optional(),
    weights: icpWeightsSchema,
  })
  .passthrough();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const authRegisterSchema = z
  .object({
    email: z.string().trim().email(),
    password: passwordSchema,
    full_name: z.string().trim().optional(),
    fullName: z.string().trim().optional(),
  })
  .passthrough();

const authLoginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  })
  .passthrough();

const analyzeSchema = z.object({
  lead: leadCreateSchema,
  icp_profile_id: z.string().trim().optional(),
  icpProfileId: z.string().trim().optional(),
  icp_profile: z.object({ id: z.string().trim().optional() }).passthrough().optional(),
  icpProfile: z.object({ id: z.string().trim().optional() }).passthrough().optional(),
  async: z.boolean().optional(),
});

const whereSchema = z.object({
  where: z.record(z.any()).default({}),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

const icpGenerateSchema = z.object({
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(2000, 'Description must be 2000 characters or fewer'),
});

const signalItemSchema = z
  .object({
    key: z.string().trim().min(1).max(200),
    evidence: z.string().trim().max(2000).optional(),
    confidence: z.number().min(0).max(100).optional(),
    source_type: z.string().trim().max(100).optional(),
    found_at: z.string().trim().max(100).optional(),
  })
  .passthrough();

const findingItemSchema = z
  .object({
    title: z.string().trim().max(500).optional(),
    snippet: z.string().trim().max(5000).optional(),
    url: z.string().trim().max(2000).optional(),
    source: z.string().trim().max(200).optional(),
  })
  .passthrough();

const externalSignalsSchema = z.object({
  signals: z.array(signalItemSchema).max(200).optional().default([]),
  findings: z.array(findingItemSchema).max(50).optional().default([]),
  replace: z.boolean().optional().default(false),
  reanalyze: z.boolean().optional(),
  async: z.boolean().optional(),
});

const authResetPasswordSchema = z.object({
  email: z.string().trim().email(),
});

const authCompletePasswordResetSchema = z.object({
  access_token: z.string().trim().min(1),
  refresh_token: z.string().trim().min(1),
  new_password: passwordSchema,
});

const demoRequestCreateSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  company: z.string().trim().min(2).max(200),
  email: z.string().trim().email(),
  team_size: z.string().trim().max(100).optional().default(''),
  interest: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  source: z.string().trim().max(120).optional().default('booking_modal'),
});

const productEventSchema = z.object({
  event: z.string().trim().min(1).max(120),
  path: z.string().trim().max(500).optional().default(''),
  source: z.string().trim().max(120).optional().default('web_app'),
  properties: z.record(z.any()).optional().default({}),
});

const workspaceInviteRoleSchema = z.enum(['admin', 'member']);

const workspaceInviteCreateSchema = z.object({
  email: z.string().trim().email(),
  role: workspaceInviteRoleSchema.default('member'),
});

const workspaceMemberRoleUpdateSchema = z.object({
  role: workspaceInviteRoleSchema,
});

const crmTypeEnum = z.enum(['hubspot', 'salesforce']);

const crmSaveSchema = z.object({
  crm_type: crmTypeEnum,
  api_token: z.string().trim().min(1).max(2000),
  config: z
    .object({
      instance_url: z.string().trim().max(500).optional(),
    })
    .optional()
    .default({}),
});

const crmSyncBulkSchema = z.object({
  lead_ids: z.array(z.string().min(1)).min(1).max(100),
  crm_type: crmTypeEnum,
});

const crmTestSchema = z.object({
  crm_type: crmTypeEnum,
});

const featureFlagUpdateSchema = z.object({
  enabled: z.boolean(),
});

const leadResearchSchema = z.object({
  company_name: z.string().trim().min(1).max(500),
  website_url: urlString,
  industry: optionalString,
  country: optionalString,
  auto_analyze: z.boolean().optional().default(false),
});

const toValidationError = (error) => {
  const issues = error.issues?.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  const wrapped = new Error('Invalid request payload');
  wrapped.status = 400;
  wrapped.details = issues || [];
  return wrapped;
};

export const validateBody = (schema) => (req, _res, next) => {
  try {
    req.validatedBody = schema.parse(req.body || {});
    return next();
  } catch (error) {
    return next(toValidationError(error));
  }
};

export const schemas = {
  authRegisterSchema,
  authLoginSchema,
  authResetPasswordSchema,
  authCompletePasswordResetSchema,
  demoRequestCreateSchema,
  productEventSchema,
  leadCreateSchema,
  leadImportSchema,
  leadPatchSchema,
  icpActiveSchema,
  analyzeSchema,
  whereSchema,
  bulkDeleteSchema,
  icpGenerateSchema,
  externalSignalsSchema,
  workspaceInviteCreateSchema,
  workspaceMemberRoleUpdateSchema,
  crmSaveSchema,
  crmSyncBulkSchema,
  crmTestSchema,
  featureFlagUpdateSchema,
  leadResearchSchema,
};
