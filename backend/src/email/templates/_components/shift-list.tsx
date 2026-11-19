import { Section, Text } from 'react-email';
import { emailTheme as theme, formatEmailShift } from './theme.js';

export interface EmailShift {
  teamName: string;
  startsAt: Date;
  endsAt: Date;
  meetingPoint?: string | null;
}

/** Shifts as small blocks: team, day and time, and where to meet. */
export function ShiftList({ shifts }: { shifts: EmailShift[] }) {
  return (
    <Section style={{ margin: '0 0 16px' }}>
      {shifts.map((shift, index) => (
        <Section
          key={index}
          style={{
            backgroundColor: theme.tint,
            borderRadius: '10px',
            padding: '12px 16px',
            margin: '0 0 8px',
          }}
        >
          <Text style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: theme.ink }}>
            {shift.teamName}
          </Text>
          <Text style={{ margin: '2px 0 0', fontSize: '14px', color: theme.ink }}>
            {formatEmailShift(shift.startsAt, shift.endsAt)}
          </Text>
          {shift.meetingPoint && (
            <Text style={{ margin: '2px 0 0', fontSize: '14px', color: theme.inkMuted }}>
              Afspreken: {shift.meetingPoint}
            </Text>
          )}
        </Section>
      ))}
    </Section>
  );
}
