/**
 * ConfirmDialog Component Tests
 * Тесты для компонента подтверждения действий
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Test Dialog',
    message: 'Are you sure?',
    type: 'danger' as const,
    onConfirm: vi.fn(),
    onCancel: vi.fn()
  };

  it('should render when open', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Test Dialog')).not.toBeInTheDocument();
  });

  it('should call onConfirm when confirm button clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('should call onCancel when cancel button clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('should call onCancel when close button clicked', async () => {
    render(<ConfirmDialog {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  it('should display correct button text for different types', () => {
    const { rerender } = render(<ConfirmDialog {...defaultProps} type="danger" />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();

    rerender(<ConfirmDialog {...defaultProps} type="warning" confirmText="Delete" />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should apply correct styling for different types', () => {
    const { rerender } = render(<ConfirmDialog {...defaultProps} type="danger" />);
    const dangerButton = screen.getByText('Confirm');
    expect(dangerButton).toHaveClass('bg-red-600');

    rerender(<ConfirmDialog {...defaultProps} type="success" />);
    const successButton = screen.getByText('Confirm');
    expect(successButton).toHaveClass('bg-green-600');
  });
});
