import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { EditMemberPhotoModal } from './EditMemberPhotoModal';

const updatePhotoMock = vi.fn();
const invalidateMembersCacheMock = vi.fn();
const compressImageForStorageMock = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    member: {
      updatePhoto: (...args: unknown[]) => updatePhotoMock(...args),
    },
  },
}));

vi.mock('@/hooks/useMembersCache', () => ({
  invalidateMembersCache: (...args: unknown[]) => invalidateMembersCacheMock(...args),
}));

vi.mock('@/utils/imageCompression', () => ({
  compressImageForStorage: (file: File) => compressImageForStorageMock(file),
  formatFileSize: (n: number) => `${n} B`,
}));

const SAMPLE_DATA_URL = 'data:image/jpeg;base64,/9j/SAMPLE';

const baseProps = {
  isOpen: true,
  memberId: 'member-1',
  memberName: 'Jane Doe',
  currentPhotoUrl: null as string | null,
  onCloseAction: vi.fn(),
  onSavedAction: vi.fn(),
};

describe('EditMemberPhotoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePhotoMock.mockResolvedValue({});
    invalidateMembersCacheMock.mockResolvedValue(undefined);
    // Default: a working compression that yields a fixed data URL.
    compressImageForStorageMock.mockImplementation(async (file: File) => ({
      compressedFile: file,
      originalSize: 1000,
      compressedSize: 200,
      compressionRatio: 80,
    }));
    // Mock FileReader so the data URL is deterministic.
    class MockFileReader {
      onload: ((e: { target: { result: string } }) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => {
          this.onload?.({ target: { result: SAMPLE_DATA_URL } });
        }, 0);
      }
    }
    vi.stubGlobal('FileReader', MockFileReader as unknown as typeof FileReader);
  });

  it('renders the title and the no-photo placeholder when no current photo is set', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: 'Edit Photo' })).toBeInTheDocument();
    expect(page.getByText('No photo uploaded')).toBeInTheDocument();
  });

  it('shows Save disabled until the user picks a file or removes', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not render the Remove button when there is no current photo', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('button', { name: 'Remove' }).elements().length).toBe(0);
  });

  it('renders the Remove button when there is a current photo', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
      </I18nWrapper>,
    );

    expect(page.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('opens the confirm dialog and only clears the photo on confirm', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Remove' }));

    expect(page.getByRole('heading', { name: 'Remove photo?' })).toBeInTheDocument();
    expect(updatePhotoMock).not.toHaveBeenCalled();

    await userEvent.click(page.getByRole('button', { name: 'Remove photo' }));

    // The Save button is enabled only after a pending change, so we click it.
    await userEvent.click(page.getByRole('button', { name: 'Save' }));

    expect(updatePhotoMock).toHaveBeenCalledWith({ id: 'member-1', photoUrl: null });
  });

  it('cancels the remove when the AlertDialog is cancelled', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Remove' }));
    // Cancel button inside the AlertDialog
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }).first());

    // Save remains disabled because no pending change
    expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(updatePhotoMock).not.toHaveBeenCalled();
  });

  it('shows an error banner and does not call updatePhoto when an unsupported file type is chosen', async () => {
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    const input = document.querySelector('#edit-member-photo-input') as HTMLInputElement;
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [pdf], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(page.getByText(/Invalid file type/)).toBeInTheDocument();
    expect(updatePhotoMock).not.toHaveBeenCalled();
    expect(compressImageForStorageMock).not.toHaveBeenCalled();
  });

  it('renders an error banner when the server rejects', async () => {
    updatePhotoMock.mockRejectedValueOnce(new Error('server boom'));

    await render(
      <I18nWrapper>
        <EditMemberPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Remove' }));
    await userEvent.click(page.getByRole('button', { name: 'Remove photo' }));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));

    expect(page.getByText('server boom')).toBeInTheDocument();
  });

  it('calls onSavedAction and onCloseAction after a successful save', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    await render(
      <I18nWrapper>
        <EditMemberPhotoModal
          {...baseProps}
          currentPhotoUrl={SAMPLE_DATA_URL}
          onSavedAction={onSaved}
          onCloseAction={onClose}
        />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Remove' }));
    await userEvent.click(page.getByRole('button', { name: 'Remove photo' }));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));

    expect(invalidateMembersCacheMock).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
