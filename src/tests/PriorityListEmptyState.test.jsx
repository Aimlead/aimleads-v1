import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/AuthContext';
import { dataClient } from '@/services/dataClient';

vi.mock('@/services/dataClient', () => ({
  isApiConfigured: true,
  dataClient: {
    mode: 'api',
    auth: {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getCurrentUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'owner@co.com',
        workspace_id: 'ws-1',
        role: 'owner',
      }),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      redirectToLogin: vi.fn(),
    },
    leads: {
      list: vi.fn(),
    },
    icp: {
      getActive: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/components/leads/ImportCSVDialog', () => ({ default: () => null }));
vi.mock('@/components/leads/LeadSlideOver', () => ({ default: () => null }));

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderPriorityList = async () => {
  const PriorityList = (await import('@/pages/PriorityList')).default;
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>
          <PriorityList />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

describe('PriorityList empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataClient.auth.isAuthenticated.mockResolvedValue(true);
    dataClient.auth.getCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'owner@co.com',
      workspace_id: 'ws-1',
      role: 'owner',
    });
  });

  it('shows the no-leads empty state when lead list is empty', async () => {
    dataClient.leads.list.mockResolvedValue([]);
    await renderPriorityList();
    const el = await screen.findByText(/aucun lead importé/i);
    expect(el).toBeInTheDocument();
  });

  it('renders leads when data is present', async () => {
    dataClient.leads.list.mockResolvedValue([
      {
        id: 'lead-1',
        company_name: 'Acme Corp',
        contact_name: 'Jane Doe',
        final_score: 85,
        icp_score: 80,
        ai_score: 90,
        status: 'new',
        source_list: 'test',
        created_at: new Date().toISOString(),
      },
    ]);
    await renderPriorityList();
    const el = await screen.findByText(/Acme Corp/i);
    expect(el).toBeInTheDocument();
  });
});
