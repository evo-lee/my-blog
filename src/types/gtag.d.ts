interface Window {
  gtag: (
    command: string,
    target: string,
    config?: Record<string, any>
  ) => void;
  dataLayer: any[];
}
