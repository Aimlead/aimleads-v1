export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AimLeads API',
    version: '1.0.0',
    description: 'Lead qualification & ICP scoring SaaS REST API.',
  },
  servers: [
    { url: '/api/v1', description: 'v1 (canonical)' },
    { url: '/api', description: 'Legacy (unversioned)' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'aimleads_session',
      },
    },
    schemas: {
      Lead: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          company_name: { type: 'string' },
          website_url: { type: 'string' },
          industry: { type: 'string' },
          company_size: { type: 'integer', nullable: true },
          country: { type: 'string' },
          contact_name: { type: 'string' },
          contact_role: { type: 'string' },
          contact_email: { type: 'string' },
          source_list: { type: 'string' },
          status: { type: 'string', enum: ['To Analyze', 'Processing', 'Qualified', 'Rejected', 'Error'] },
          follow_up_status: { type: 'string' },
          final_score: { type: 'integer', nullable: true },
          icp_score: { type: 'integer', nullable: true },
          icp_category: { type: 'string', nullable: true },
          created_date: { type: 'string', format: 'date-time' },
          last_analyzed_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      IcpProfile: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          is_active: { type: 'boolean' },
          weights: { type: 'object' },
          created_date: { type: 'string', format: 'date-time' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          full_name: { type: 'string' },
          workspace_id: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          request_id: { type: 'string' },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          page: { type: 'integer' },
          pages: { type: 'integer' },
        },
      },
    },
  },
  security: [{ cookieAuth: [] }],
  paths: {
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        responses: {
          200: { description: 'Current user', content: { 'application/json': { schema: { properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          401: { description: 'Unauthorized' },
        },
      },
      patch: {
        tags: ['Auth'],
        summary: 'Update current user profile',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  full_name: { type: 'string' },
                  current_password: { type: 'string' },
                  new_password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Updated user' },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new account',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  full_name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Account created' },
          409: { description: 'User already exists' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        responses: {
          204: { description: 'Logged out' },
        },
      },
    },
    '/leads': {
      get: {
        tags: ['Leads'],
        summary: 'List all leads',
        parameters: [
          { name: 'sort', in: 'query', schema: { type: 'string', default: '-created_date' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000 } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
        ],
        responses: {
          200: {
            description: 'List of leads',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                    meta: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Leads'],
        summary: 'Create a lead',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['company_name'],
                properties: {
                  company_name: { type: 'string' },
                  website_url: { type: 'string' },
                  industry: { type: 'string' },
                  company_size: { type: 'integer', nullable: true },
                  country: { type: 'string' },
                  contact_name: { type: 'string' },
                  contact_role: { type: 'string' },
                  contact_email: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Lead created' },
        },
      },
    },
    '/leads/search': {
      get: {
        tags: ['Leads'],
        summary: 'Search leads',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1 } },
        ],
        responses: {
          200: { description: 'Matching leads' },
          400: { description: 'Missing query parameter' },
        },
      },
    },
    '/leads/{leadId}': {
      get: {
        tags: ['Leads'],
        summary: 'Get lead by ID',
        parameters: [{ name: 'leadId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Lead found' },
          404: { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Leads'],
        summary: 'Update lead',
        parameters: [{ name: 'leadId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Lead updated' },
          404: { description: 'Not found' },
        },
      },
      delete: {
        tags: ['Leads'],
        summary: 'Delete lead',
        parameters: [{ name: 'leadId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Lead deleted' },
          404: { description: 'Not found' },
        },
      },
    },
    '/icp': {
      get: {
        tags: ['ICP'],
        summary: 'List ICP profiles',
        responses: {
          200: { description: 'List of ICP profiles' },
        },
      },
      post: {
        tags: ['ICP'],
        summary: 'Create ICP profile',
        responses: {
          201: { description: 'ICP profile created' },
        },
      },
    },
    '/icp/active': {
      get: {
        tags: ['ICP'],
        summary: 'Get active ICP profile',
        responses: {
          200: { description: 'Active ICP profile or null' },
        },
      },
      put: {
        tags: ['ICP'],
        summary: 'Set active ICP profile',
        responses: {
          200: { description: 'Active ICP profile updated' },
          404: { description: 'Profile not found' },
        },
      },
    },
    '/icp/{profileId}': {
      get: {
        tags: ['ICP'],
        summary: 'Get ICP profile by ID',
        parameters: [{ name: 'profileId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'ICP profile' },
          404: { description: 'Not found' },
        },
      },
      patch: {
        tags: ['ICP'],
        summary: 'Update ICP profile',
        parameters: [{ name: 'profileId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Updated ICP profile' },
          404: { description: 'Not found' },
        },
      },
      delete: {
        tags: ['ICP'],
        summary: 'Delete ICP profile',
        parameters: [{ name: 'profileId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Deleted' },
          404: { description: 'Not found' },
        },
      },
    },
    '/analyze': {
      post: {
        tags: ['Analyze'],
        summary: 'Run lead analysis',
        responses: {
          200: { description: 'Analysis result' },
        },
      },
    },
    '/audit': {
      get: {
        tags: ['Audit'],
        summary: 'List audit log entries',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: { description: 'Audit log entries' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        security: [],
        responses: {
          200: { description: 'Service status' },
        },
      },
    },
  },
};
