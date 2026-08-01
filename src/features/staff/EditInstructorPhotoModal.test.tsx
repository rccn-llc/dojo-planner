import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { I18nWrapper } from '@/lib/test-utils';
import { EditInstructorPhotoModal } from './EditInstructorPhotoModal';

const updatePhotoMock = vi.fn();
const invalidateInstructorsCacheMock = vi.fn();
const compressImageForStorageMock = vi.fn();

vi.mock('@/libs/Orpc', () => ({
  client: {
    instructors: {
      updatePhoto: (...args: unknown[]) => updatePhotoMock(...args),
    },
  },
}));

vi.mock('@/hooks/useInstructorsCache', () => ({
  invalidateInstructorsCache: (...args: unknown[]) => invalidateInstructorsCacheMock(...args),
}));

vi.mock('@/utils/imageCompression', () => ({
  compressImageForStorage: (file: File) => compressImageForStorageMock(file),
  formatFileSize: (n: number) => `${n} B`,
}));

const SAMPLE_DATA_URL = 'data:image/png;base64,AAAA';

const baseProps = {
  isOpen: true,
  clerkUserId: 'ins-1',
  instructorName: 'Ann Lee',
  currentPhotoUrl: null as string | null,
  onCloseAction: vi.fn(),
  onSavedAction: vi.fn(),
};

describe('EditInstructorPhotoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePhotoMock.mockResolvedValue({});
    invalidateInstructorsCacheMock.mockResolvedValue(undefined);
    compressImageForStorageMock.mockImplementation(async (file: File) => ({
      compressedFile: file,
      originalSize: 1000,
      compressedSize: 200,
      compressionRatio: 80,
    }));
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
        <EditInstructorPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('heading', { name: 'Edit Staff Photo' })).toBeInTheDocument();
    expect(page.getByText('No photo uploaded')).toBeInTheDocument();
  });

  it('shows Save disabled until the user picks a file or removes', async () => {
    await render(
      <I18nWrapper>
        <EditInstructorPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not render the Remove button when there is no current photo', async () => {
    await render(
      <I18nWrapper>
        <EditInstructorPhotoModal {...baseProps} />
      </I18nWrapper>,
    );

    expect(page.getByRole('button', { name: 'Remove' }).elements().length).toBe(0);
  });

  it('renders the Remove button when there is a current photo', async () => {
    await render(
      <I18nWrapper>
        <EditInstructorPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
      </I18nWrapper>,
    );

    expect(page.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('opens the confirm dialog and only clears the photo on confirm (photoUrl null)', async () => {
    await render(
      <I18nWrapper>
        <EditInstructorPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
      </I18nWrapper>,
    );

    await userEvent.click(page.getByRole('button', { name: 'Remove' }));

    expect(page.getByRole('heading', { name: 'Remove photo?' })).toBeInTheDocument();
    expect(updatePhotoMock).not.toHaveBeenCalled();

    await userEvent.click(page.getByRole('button', { name: 'Remove photo' }));
    await userEvent.click(page.getByRole('button', { name: 'Save' }));

    expect(updatePhotoMock).toHaveBeenCalledWith({ clerkUserId: 'ins-1', photoUrl: null });
  });

  it('renders an error banner when the server rejects', async () => {
    updatePhotoMock.mockRejectedValueOnce(new Error('server boom'));

    await render(
      <I18nWrapper>
        <EditInstructorPhotoModal {...baseProps} currentPhotoUrl={SAMPLE_DATA_URL} />
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
        <EditInstructorPhotoModal
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

    expect(invalidateInstructorsCacheMock).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
