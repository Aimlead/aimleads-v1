import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import LeadsTable from '@/components/leads/LeadsTable';
import { dataClient } from '@/services/dataClient';

vi.mock('@/services/dataClient', () => ({
  dataClient: {
    leads: {
      update: vi.fn(),
      reanalyze: vi.fn(),
      delete: vi.fn(),
    },
    crm: {
      list: vi.fn().mockResolvedValue([]),
    },
    workspace: {
      listFeatureFlags: vi.fn().mockResolvedValue({ flags: [] }),
    },
    jobs: {
      getStatus: vi.fn(),
    },
  },
}));

const MOCK_LEADS = [
  {
    id: 'lead-1',
    company_name: 'Alpha Corp',
    website_url: 'alpha.com',
    industry: 'Software',
    country: 'France',
    company_size: 150,
    contact_name: 'Alice Martin',
    contact_role: 'CTO',
    contact_email: 'alice@alpha.com',
    source_list: 'List A',
    status: 'To Analyze',
    follow_up_status: 'To Contact',
    icp_score: 72,
    ai_score: 45,
    final_score: 61,
    final_category: 'Strong Fit',
    final_recommended_action: 'Call this week',
  },
  {
    id: 'lead-2',
    company_name: 'Beta Inc',
    website_url: 'beta.io',
    industry: 'Finance',
    country: 'Germany',
    company_size: 500,
    contact_name: 'Bob Smith',
    contact_role: 'CFO',
    contact_email: 'bob@beta.io',
    source_list: 'List B',
    status: 'Qualified',
    follow_up_status: 'Called',
    icp_score: 88,
    ai_score: 75,
    final_score: 83,
    final_category: 'Excellent',
    final_recommended_action: 'Fast track',
  },
];

const defaultProps = {
  leads: MOCK_LEADS,
  onSelectLead: vi.fn(),
  onOpenLeadPage: vi.fn(),
  onLeadUpdated: vi.fn(),
};

const renderTable = async (props = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LeadsTable {...defaultProps} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(dataClient.crm.list).toHaveBeenCalled();
  });

  return view;
};

const SEARCH_PLACEHOLDER = /search leads|rechercher des leads/i;
const SELECTED_TEXT = /selected|sélectionné/i;
const EMPTY_TEXT = /no leads|aucun lead/i;
const SELECT_ALL_TEXT = /select all leads|sélectionner tous les leads/i;

// The table renders leads in two layouts (desktop table + mobile cards),
// so each company name appears twice — use getAllByText for these assertions.

describe('LeadsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataClient.crm.list.mockResolvedValue([]);
    dataClient.workspace.listFeatureFlags.mockResolvedValue({ flags: [] });
  });

  it('renders all leads', async () => {
    await renderTable();
    // Component renders leads in both mobile and desktop views simultaneously (CSS hide/show)
    expect(screen.getAllByText('Alpha Corp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta Inc').length).toBeGreaterThan(0);
  });

  it('shows lead count stats', async () => {
    await renderTable();
    expect(screen.getAllByText(/Visible/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Qualified/).length).toBeGreaterThan(0);
  });

  it('filters leads by search text', async () => {
    await renderTable();
    const searchInput = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
    await userEvent.type(searchInput, 'Alpha');
    // Wait for 300ms debounce to flush
    await waitFor(() => {
      expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
    }, { timeout: 1000 });
    expect(screen.getAllByText('Alpha Corp').length).toBeGreaterThan(0);
  });

  it('shows "No leads found" when search has no match', async () => {
    await renderTable();
    const searchInput = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
    await userEvent.type(searchInput, 'zzz-no-match');
    // Wait for 300ms debounce to flush
    await waitFor(() => {
      expect(screen.getAllByText(EMPTY_TEXT).length).toBeGreaterThan(0);
    }, { timeout: 1000 });
  });

  it('calls onSelectLead when clicking a row', async () => {
    await renderTable();
    // Use the desktop table row (font-medium class — mobile cards use font-semibold)
    const nameEl = screen.getAllByText('Alpha Corp').find(
      (el) => el.className.includes('font-medium')
    );
    const row = nameEl.closest('tr');
    await userEvent.click(row);
    expect(defaultProps.onSelectLead).toHaveBeenCalledWith(MOCK_LEADS[0]);
  });

  it('select all checkbox selects all visible leads', async () => {
    await renderTable();
    const selectAll = screen.getByLabelText(SELECT_ALL_TEXT);
    await userEvent.click(selectAll);
    // Bulk action bar should appear
    expect(screen.getAllByText(SELECTED_TEXT).length).toBeGreaterThan(0);
  });

  it('shows delete confirmation dialog on single delete', async () => {
    await renderTable();
    // Both views render delete buttons; click any one
    const deleteBtns = screen.getAllByLabelText('Delete Alpha Corp');
    await userEvent.click(deleteBtns[0]);
    expect(screen.getAllByText(/Delete Alpha Corp|Supprimer Alpha Corp/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/cannot be undone|irréversible/i)).toBeInTheDocument();
  });

  it('calls dataClient.leads.delete on confirming single delete', async () => {
    dataClient.leads.delete.mockResolvedValue({});
    await renderTable();

    const deleteBtns = screen.getAllByLabelText('Delete Alpha Corp');
    await userEvent.click(deleteBtns[0]);

    const confirmBtn = screen.getByText(/Delete lead|Supprimer le lead/i);
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(dataClient.leads.delete).toHaveBeenCalledWith('lead-1');
    });
  });

  it('displays score values correctly', async () => {
    await renderTable();
    // Scores appear in both mobile and desktop ScorePills
    expect(screen.getAllByText('61').length).toBeGreaterThan(0);
    expect(screen.getAllByText('83').length).toBeGreaterThan(0);
  });
});
