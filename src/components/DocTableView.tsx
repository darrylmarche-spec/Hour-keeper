import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SectionBar } from '@/components/ui';
import { DocTable } from '@/reports/document';
import Colors, { Fonts } from '@/theme/colors';

// One report table on screen. Number columns are narrow and right-aligned;
// text columns share the rest, so it fits a phone held upright.
export function DocTableView({ table }: { table: DocTable }) {
  const strong = new Set(table.strong ?? []);
  const over = new Set((table.over ?? []).map(([r, c]) => `${r}:${c}`));
  const width = (i: number) => (table.numeric.includes(i) ? (table.columns[i].length > 6 ? 62 : 50) : undefined);
  const hidden = (i: number) => table.columns[i] === '' || table.columns[i] === 'Line';
  return (
    <View>
      <SectionBar title={table.heading} />
      {table.note ? <Text style={styles.note}>{table.note}</Text> : null}
      <View style={[styles.row, styles.head]}>
        {table.columns.map((c, i) =>
          hidden(i) ? null : (
            <Text key={i} style={[styles.headText, width(i) ? { width: width(i), textAlign: 'right' } : styles.flex]} numberOfLines={1}>
              {c === 'Over / under' ? '+/−' : c}
            </Text>
          ),
        )}
      </View>
      {table.rows.map((row, ri) => (
        <View key={ri} style={[styles.row, strong.has(ri) && styles.strongRow]}>
          {row.map((cell, ci) => {
            if (hidden(ci)) return null;
            const lineNo = table.columns[0] === 'Line' && ci === 1 && row[0] ? `${row[0]}  ` : '';
            return (
              <Text
                key={ci}
                style={[
                  styles.cell,
                  width(ci) ? { width: width(ci), textAlign: 'right' } : styles.flex,
                  strong.has(ri) && styles.strongText,
                  over.has(`${ri}:${ci}`) && styles.over,
                ]}
              >
                {lineNo ? <Text style={styles.lineNo}>{lineNo}</Text> : null}
                {cell}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: 16, paddingTop: 8, fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  head: { backgroundColor: Colors.chrome, borderBottomWidth: 0 },
  headText: { fontFamily: Fonts.bold, fontSize: 11.5, color: Colors.textOnDark, textTransform: 'uppercase', letterSpacing: 0.3 },
  flex: { flex: 1, minWidth: 0 },
  cell: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.text },
  lineNo: { fontFamily: Fonts.bold, color: Colors.textTertiary },
  strongRow: { backgroundColor: Colors.surfaceSecondary },
  strongText: { fontFamily: Fonts.bold },
  over: { color: Colors.danger, fontFamily: Fonts.bold },
});
