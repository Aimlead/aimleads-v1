import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

// The table renders leads in two layouts (desktop table + mobile cards),
// so each company name appears twice — use getAllByText for these assertions.

describe('LeadsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all leads', () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    expect(screen.getAllByText('Alpha Corp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Beta Inc').length).toBeGreaterThan(0);
  });

  it('shows lead count stats', () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    expect(screen.getAllByText(/Visible/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Qualified/).length).toBeGreaterThan(0);
  });

  it('filters leads by search text', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    const searchInput = screen.getByPlaceholderText('Search leads...');
    await userEvent.type(searchInput, 'Alpha');
    expect(screen.getAllByText('Alpha Corp').length).toBeGreaterThan(0);
    expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
  });

  it('shows "No leads found" when search has no match', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    const searchInput = screen.getByPlaceholderText('Search leads...');
    await userEvent.type(searchInput, 'zzz-no-match');
    expect(screen.getAllByText(/no leads/i).length).toBeGreaterThan(0);
  });

  it('calls onSelectLead when clicking a row', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    // Use the desktop table row (font-medium class — mobile cards use font-semibold)
    const nameEl = screen.getAllByText('Alpha Corp').find(
      (el) => el.className.includes('font-medium')
    );
    const row = nameEl.closest('tr');
    await userEvent.click(row);
    expect(defaultProps.onSelectLead).toHaveBeenCalledWith(MOCK_LEADS[0]);
  });

  it('select all checkbox selects all visible leads', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    const selectAll = screen.getByLabelText('Select all leads');
    await userEvent.click(selectAll);
    // Bulk action bar should appear
    expect(screen.getAllByText(/selected/).length).toBeGreaterThan(0);
  });

  it('shows delete confirmation dialog on single delete', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    // Use the first Delete Alpha Corp aria-label (desktop table row)
    const deleteBtns = screen.getAllByLabelText('Delete Alpha Corp');
    await userEvent.click(deleteBtns[0]);
    expect(screen.getAllByText(/Delete Alpha Corp/).length).toBeGreaterThan(0);
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('calls dataClient.leads.delete on confirming single delete', async () => {
    dataClient.leads.delete.mockResolvedValue({});
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);

    const deleteBtns = screen.getAllByLabelText('Delete Alpha Corp');
    await userEvent.click(deleteBtns[0]);

    const confirmBtn = screen.getByText('Delete lead');
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(dataClient.leads.delete).toHaveBeenCalledWith('lead-1');
    });
  });

  it('displays score values correctly', () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    // Final scores displayed via ScorePill
    expect(screen.getAllByText('61').length).toBeGreaterThan(0);
    expect(screen.getAllByText('83').length).toBeGreaterThan(0);
  });
});
