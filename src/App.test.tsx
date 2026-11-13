import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('shows the loading state while the data loads', () => {
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
  });
});
