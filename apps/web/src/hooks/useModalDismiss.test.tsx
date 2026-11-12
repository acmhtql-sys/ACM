// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useModalDismiss } from './useModalDismiss';

function TestModal({
  isOpen,
  onClose,
  disabled = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
}) {
  const backdropProps = useModalDismiss(isOpen, onClose, disabled);
  if (!isOpen) return null;
  return (
    <div data-testid="backdrop" {...backdropProps}>
      <div data-testid="card">
        <input data-testid="input" />
      </div>
    </div>
  );
}

describe('useModalDismiss', () => {
  afterEach(() => {
    cleanup();
  });

  it('closes when clicking directly on the blurred backdrop', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);

    const backdrop = screen.getByTestId('backdrop');
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the modal card', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);

    const card = screen.getByTestId('card');
    fireEvent.mouseDown(card);
    fireEvent.click(card);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close when dragging pointer from inside card onto backdrop', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId('input'));
    fireEvent.click(screen.getByTestId('backdrop'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape key when open and enabled, and respects disabled flag', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TestModal isOpen onClose={onClose} disabled />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    rerender(<TestModal isOpen onClose={onClose} disabled={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

