import type { ReactNode } from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'react-email';
import { emailTheme as theme } from './theme.js';

/**
 * The frame every email shares: preheader, wordmark, a white card with the content, and a
 * footer that says why the recipient got this email. Templates only fill in the card.
 */
export function EmailLayout({
  preview,
  heading,
  reason,
  children,
}: {
  /** The preheader: the grey line inboxes show next to the subject. */
  preview: string;
  heading: string;
  /** Completes "Je ontvangt deze e-mail omdat …". */
  reason: string;
  children: ReactNode;
}) {
  return (
    <Html lang="nl">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        lang="nl"
        style={{ backgroundColor: theme.background, fontFamily: theme.fontFamily, margin: 0 }}
      >
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 16px' }}>
          <Section style={{ padding: '0 8px 24px' }}>
            <Text
              style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 800,
                color: theme.primary,
                letterSpacing: '-0.01em',
              }}
            >
              VolunteerOS
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: theme.card,
              border: `1px solid ${theme.line}`,
              borderRadius: '12px',
              padding: '32px',
            }}
          >
            <Heading
              as="h1"
              style={{
                margin: '0 0 16px',
                fontSize: '22px',
                lineHeight: '30px',
                fontWeight: 700,
                color: theme.ink,
              }}
            >
              {heading}
            </Heading>
            {children}
          </Section>
          <Section style={{ padding: '24px 8px 0' }}>
            <Text
              style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: theme.inkMuted }}
            >
              Je ontvangt deze e-mail omdat {reason}
            </Text>
            <Text style={{ margin: '8px 0 0', fontSize: '12px', color: theme.inkMuted }}>
              VolunteerOS
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function Paragraph({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '24px',
        color: muted ? theme.inkMuted : theme.ink,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * The one action of the email, with the raw link underneath for clients that block buttons
 * and for people who prefer to copy it.
 */
export function CallToAction({ href, children }: { href: string; children: string }) {
  return (
    <>
      <Section style={{ margin: '8px 0 24px' }}>
        <Button
          href={href}
          style={{
            backgroundColor: theme.primary,
            color: theme.primaryForeground,
            borderRadius: '8px',
            padding: '12px 20px',
            fontSize: '15px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          {children}
        </Button>
      </Section>
      {/* The plain-text version already shows the link next to the button text. */}
      <Section data-skip-in-text="true">
        <Text
          style={{ margin: '0 0 4px', fontSize: '13px', lineHeight: '20px', color: theme.inkMuted }}
        >
          Werkt de knop niet? Kopieer dan deze link in je browser:
        </Text>
        <Text
          style={{
            margin: '0 0 16px',
            fontSize: '13px',
            lineHeight: '20px',
            wordBreak: 'break-all',
          }}
        >
          <Link href={href} style={{ color: theme.primary }}>
            {href}
          </Link>
        </Text>
      </Section>
    </>
  );
}
