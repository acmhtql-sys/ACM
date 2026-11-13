// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DatePickerVi, formatIsoToVi, parseViToIso } from './DatePickerVi';

describe('DatePickerVi Suite', () => {
  afterEach(() => {
    cleanup();
  });
  it('correctly formats ISO to Vietnamese DD/MM/YYYY and parses back', () => {
    expect(formatIsoToVi('2026-11-13')).toBe('13/11/2026');
    expect(formatIsoToVi('2026-01-05')).toBe('05/01/2026');
    expect(formatIsoToVi('')).toBe('');
    expect(formatIsoToVi('invalid')).toBe('');

    expect(parseViToIso('13/11/2026')).toBe('2026-11-13');
    expect(parseViToIso('05/01/2026')).toBe('2026-01-05');
    expect(parseViToIso('31/02/2026')).toBeNull(); // Invalid date
    expect(parseViToIso('')).toBeNull();
  });

  it('renders trigger button with formatted Vietnamese date', () => {
    const handleChange = vi.fn();
    render(
      <DatePickerVi
        value="2026-11-13"
        onChange={handleChange}
        testId="test-datepicker"
      />
    );

    const trigger = screen.getByTestId('test-datepicker');
    expect(trigger.textContent).toContain('13/11/2026');
  });

  it('opens popup calendar on trigger click and shows Vietnamese month and weekday labels', () => {
    const handleChange = vi.fn();
    render(
      <DatePickerVi
        value="2026-11-13"
        onChange={handleChange}
        testId="test-datepicker"
      />
    );

    const trigger = screen.getByTestId('test-datepicker');
    fireEvent.click(trigger);

    // Month & year
    expect(screen.getByText('Tháng 11')).toBeDefined();
    expect(screen.getByText('2026')).toBeDefined();

    // Weekdays
    expect(screen.getByText('T2')).toBeDefined();
    expect(screen.getByText('T3')).toBeDefined();
    expect(screen.getByText('T4')).toBeDefined();
    expect(screen.getByText('T5')).toBeDefined();
    expect(screen.getByText('T6')).toBeDefined();
    expect(screen.getByText('T7')).toBeDefined();
    expect(screen.getByText('CN')).toBeDefined();
  });

  it('calls onChange with ISO string when a valid day is clicked', () => {
    const handleChange = vi.fn();
    render(
      <DatePickerVi
        value="2026-11-13"
        onChange={handleChange}
        testId="test-datepicker"
      />
    );

    fireEvent.click(screen.getByTestId('test-datepicker'));

    // Click day 20
    const day20Btn = document.querySelector('[data-date="2026-11-20"]') as HTMLButtonElement;
    expect(day20Btn).toBeDefined();
    fireEvent.click(day20Btn);

    expect(handleChange).toHaveBeenCalledWith('2026-11-20');
  });

  it('disables dates before minDate', () => {
    const handleChange = vi.fn();
    render(
      <DatePickerVi
        value="2026-11-13"
        minDate="2026-11-10"
        onChange={handleChange}
        testId="test-datepicker"
      />
    );

    fireEvent.click(screen.getByTestId('test-datepicker'));

    // Day 5 should be disabled
    const day5Btn = document.querySelector('[data-date="2026-11-05"]') as HTMLButtonElement;
    expect(day5Btn).toBeDefined();
    expect(day5Btn).toHaveProperty('disabled', true);

    fireEvent.click(day5Btn);
    expect(handleChange).not.toHaveBeenCalled();
  });
});
