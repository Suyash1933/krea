import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NextFlow",
  description: "AI workflow builder powered by Gemini",
};

const clerkAppearance: NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]> = {
  layout: {
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
  },
  elements: {
    modalBackdrop: "nf-clerk-backdrop",
    modalContent: "nf-clerk-modal-content",
    modalCloseButton: "nf-clerk-close-btn",
    card: "nf-clerk-card",
    headerTitle: "nf-clerk-header-title",
    headerSubtitle: "nf-clerk-header-subtitle",
    socialButtonsBlockButton: "nf-clerk-social-btn",
    socialButtonsBlockButtonText: "nf-clerk-social-btn-text",
    dividerLine: "nf-clerk-divider-line",
    dividerText: "nf-clerk-divider-text",
    formFieldInput: "nf-clerk-input",
    formFieldInputShowPasswordButton: "nf-clerk-input-eye",
    formFieldLabel: "nf-clerk-label",
    formButtonPrimary: "nf-clerk-primary-btn",
    footer: "nf-clerk-footer",
    footerActionText: "nf-clerk-footer-text",
    footerActionLink: "nf-clerk-footer-link",
    formFieldHintText: "nf-clerk-hint",
    formFieldErrorText: "nf-clerk-error",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
