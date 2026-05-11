interface Window {
  gtag: (
    command: string,
    target: string,
    config?: Record<string, unknown>
  ) => void;
  dataLayer: unknown[];
}
