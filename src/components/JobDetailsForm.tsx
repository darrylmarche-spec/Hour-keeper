import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Field } from '@/components/ui';
import { JobDetails } from '@/jobs/draft';
import Colors, { Fonts } from '@/theme/colors';

type Problems = Partial<Record<keyof JobDetails, string>>;

export function JobDetailsForm({
  details,
  onChange,
  problems = {},
}: {
  details: JobDetails;
  onChange: (d: JobDetails) => void;
  problems?: Problems;
}) {
  const set = (k: keyof JobDetails) => (v: string) => onChange({ ...details, [k]: v });
  const err = (k: keyof JobDetails) => (problems[k] ? <Text style={styles.error}>{problems[k]}</Text> : null);

  return (
    <View style={styles.form}>
      <View>
        <Field label="Job name" value={details.name} onChangeText={set('name')} placeholder="e.g. Highett Common Building F - Duplex" />
        {err('name')}
      </View>
      <View style={styles.row}>
        <View style={styles.half}>
          <Field label="Project No." value={details.job_number} onChangeText={set('job_number')} placeholder="0813190833" autoCapitalize="characters" />
        </View>
        <View style={styles.half}>
          <Field label="Quotation No." value={details.quotation_number} onChangeText={set('quotation_number')} placeholder="303879675" autoCapitalize="characters" />
        </View>
      </View>
      <Field label="Customer / builder" value={details.customer} onChangeText={set('customer')} />
      <Field label="Site address" value={details.site_address} onChangeText={set('site_address')} placeholder="Graham Road, Highett VIC 3190" />
      <View style={styles.row}>
        <View style={styles.third}>
          <Field label="Stops" value={details.stops} onChangeText={set('stops')} keyboardType="number-pad" placeholder="8" />
          {err('stops')}
        </View>
        <View style={styles.third}>
          <Field label="Travel (m)" value={details.travel} onChangeText={set('travel')} keyboardType="decimal-pad" placeholder="22.92" />
          {err('travel')}
        </View>
        <View style={styles.third}>
          <Field
            label="Sheet total (hrs)"
            value={details.quoted_total}
            onChangeText={set('quoted_total')}
            keyboardType="decimal-pad"
            placeholder="optional"
          />
          {err('quoted_total')}
        </View>
      </View>
      <View>
        <Field
          label="Deadline (optional)"
          value={details.deadline}
          onChangeText={set('deadline')}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          hint="Leave blank if there's no set date."
        />
        {err('deadline')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  half: { flexGrow: 1, flexBasis: 150 },
  third: { flexGrow: 1, flexBasis: 100 },
  error: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.danger, marginTop: 4 },
});
