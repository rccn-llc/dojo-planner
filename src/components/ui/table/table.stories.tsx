import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '../avatar';
import { Pagination } from '../pagination/Pagination';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../table';

const meta = {
  title: 'UI/Display/Table',
  component: Table,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>A list of your recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-25">Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">INV001</TableCell>
          <TableCell>Paid</TableCell>
          <TableCell>Credit Card</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV002</TableCell>
          <TableCell>Pending</TableCell>
          <TableCell>PayPal</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">INV003</TableCell>
          <TableCell>Unpaid</TableCell>
          <TableCell>Bank Transfer</TableCell>
          <TableCell className="text-right">$75.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const Products: Story = {
  render: () => (
    <Table>
      <TableCaption>Product inventory</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Price</TableHead>
          <TableHead className="text-right">Stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Laptop</TableCell>
          <TableCell>Electronics</TableCell>
          <TableCell>$999</TableCell>
          <TableCell className="text-right">25</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Mouse</TableCell>
          <TableCell>Accessories</TableCell>
          <TableCell>$29</TableCell>
          <TableCell className="text-right">150</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Keyboard</TableCell>
          <TableCell>Accessories</TableCell>
          <TableCell>$79</TableCell>
          <TableCell className="text-right">85</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Monitor</TableCell>
          <TableCell>Electronics</TableCell>
          <TableCell>$299</TableCell>
          <TableCell className="text-right">40</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithoutCaption: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Alice Johnson</TableCell>
          <TableCell>alice@example.com</TableCell>
          <TableCell>Admin</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Bob Smith</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>Editor</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Carol White</TableCell>
          <TableCell>carol@example.com</TableCell>
          <TableCell>Viewer</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

// Wrapper component to manage pagination state
function BillingHistoryDemo() {
  const [currentPage, setCurrentPage] = useState(0);

  return (
    <div className="w-full">
      <h2 className="mb-6 text-title font-medium">Billing History</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Purpose</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>OR</AvatarFallback>
                </Avatar>
                <span className="font-medium">Olivia Rhye</span>
              </div>
            </TableCell>
            <TableCell>April 15, 2025</TableCell>
            <TableCell>$160.00</TableCell>
            <TableCell>Membership Dues</TableCell>
            <TableCell>Card Ending ••••1234</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>OR</AvatarFallback>
                </Avatar>
                <span className="font-medium">Olivia Rhye</span>
              </div>
            </TableCell>
            <TableCell>May 15, 2025</TableCell>
            <TableCell>$160.00</TableCell>
            <TableCell>Membership Dues</TableCell>
            <TableCell>Card Ending ••••1234</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>OR</AvatarFallback>
                </Avatar>
                <span className="font-medium">Olivia Rhye</span>
              </div>
            </TableCell>
            <TableCell>June 15, 2025</TableCell>
            <TableCell>$160.00</TableCell>
            <TableCell>Membership Dues</TableCell>
            <TableCell>Card Ending ••••1234</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>OR</AvatarFallback>
                </Avatar>
                <span className="font-medium">Olivia Rhye</span>
              </div>
            </TableCell>
            <TableCell>July 15, 2025</TableCell>
            <TableCell>$160.00</TableCell>
            <TableCell>Membership Dues</TableCell>
            <TableCell>Card Ending ••••1234</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="size-8">
                  <AvatarFallback>OR</AvatarFallback>
                </Avatar>
                <span className="font-medium">Olivia Rhye</span>
              </div>
            </TableCell>
            <TableCell>August 15, 2025</TableCell>
            <TableCell>$160.00</TableCell>
            <TableCell>Membership Dues</TableCell>
            <TableCell>Card Ending ••••1234</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button type="button" className="p-1">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <div className="mt-6">
        <Pagination
          currentPage={currentPage}
          totalPages={4}
          totalItems={20}
          itemsPerPage={5}
          onPageChangeAction={setCurrentPage}
        />
      </div>
    </div>
  );
}

export const BillingHistory: Story = {
  render: () => <BillingHistoryDemo />,
};
