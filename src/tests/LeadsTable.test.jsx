import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('LeadsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all leads', () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    // Component renders leads in both mobile and desktop views simultaneously (CSS hide/show)
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
    // Both mobile and desktop views render the match, so at least one must exist
    expect(screen.getAllByText('Alpha Corp').length).toBeGreaterThan(0);
    expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument();
  });

  it('shows "No leads found" when search has no match', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    const searchInput = screen.getByPlaceholderText('Search leads...');
    await userEvent.type(searchInput, 'zzz-no-match');
    // Both mobile and desktop render the empty state
    expect(screen.getAllByText(/no leads/i).length).toBeGreaterThan(0);
  });

  it('calls onSelectLead when clicking a row', async () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    // Both views render; click the first occurrence — mobile card bubbles up to its clickable div
    const companyEl = screen.getAllByText('Alpha Corp')[0];
    await userEvent.click(companyEl);
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
    // Both views render delete buttons; click any one
    const deleteBtn = screen.getAllByLabelText('Delete Alpha Corp')[0];
    await userEvent.click(deleteBtn);
    expect(screen.getByText(/Delete Alpha Corp/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it('calls dataClient.leads.delete on confirming single delete', async () => {
    dataClient.leads.delete.mockResolvedValue({});
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);

    const deleteBtn = screen.getAllByLabelText('Delete Alpha Corp')[0];
    await userEvent.click(deleteBtn);

    const confirmBtn = screen.getByText('Delete lead');
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(dataClient.leads.delete).toHaveBeenCalledWith('lead-1');
    });
  });

  it('displays score values correctly', () => {
    render(<MemoryRouter><LeadsTable {...defaultProps} /></MemoryRouter>);
    // Scores appear in both mobile and desktop ScorePills
    expect(screen.getAllByText('61').length).toBeGreaterThan(0);
    expect(screen.getAllByText('83').length).toBeGreaterThan(0);
  });
});
