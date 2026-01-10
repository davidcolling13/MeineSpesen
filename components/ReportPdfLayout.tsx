import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import { Movement, Employee } from '../types';

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 9, // Compact font size
    color: '#1a1a1a',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  employeeInfo: {
    textAlign: 'right',
  },
  employeeName: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Table
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    minHeight: 18,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: '#f3f4f6',
    fontWeight: 'bold',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  
  // Columns (Total width 100%)
  colDate: { width: '15%', paddingLeft: 5 },
  colLoc: { width: '40%', paddingLeft: 5 },
  colTime: { width: '10%', textAlign: 'right', paddingRight: 5 },
  colDur: { width: '10%', textAlign: 'right', paddingRight: 5 },
  colAmt: { width: '15%', textAlign: 'right', paddingRight: 5 },

  // Footer
  footerContainer: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  totalBox: {
    width: '40%',
    backgroundColor: '#f3f4f6',
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#000',
  },
  totalLabel: { fontWeight: 'bold' },
  totalValue: { fontWeight: 'bold' },

  signatureContainer: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  signatureLine: {
    width: '40%',
    borderTopWidth: 1,
    borderColor: '#000',
    paddingTop: 5,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
  },
});

interface ReportPdfProps {
  movements: Movement[];
  employee: Employee;
  monthName: string;
  year: number;
  totals: { hours: number; amount: number };
}

const ReportPdfLayout: React.FC<ReportPdfProps> = ({ movements, employee, monthName, year, totals }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      
      {/* Header */}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.title}>Spesenabrechnung</Text>
          <Text style={styles.subtitle}>Zeitraum: {monthName} {year}</Text>
        </View>
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName}>{employee.lastName}, {employee.firstName}</Text>
          <Text style={styles.subtitle}>PNR: {employee.id}</Text>
        </View>
      </View>

      {/* Table Header */}
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={styles.colDate}>Datum</Text>
        <Text style={styles.colLoc}>Ort</Text>
        <Text style={styles.colTime}>Beginn</Text>
        <Text style={styles.colTime}>Ende</Text>
        <Text style={styles.colDur}>Stunden</Text>
        <Text style={styles.colAmt}>Betrag (€)</Text>
      </View>

      {/* Table Body */}
      {movements.map((m) => {
          // Format date DD.MM.YYYY
          const d = new Date(m.date);
          const dateStr = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth()+1).toString().padStart(2, '0')}.${d.getFullYear()}`;
          
          return (
            <View key={m.id} style={styles.tableRow}>
                <Text style={styles.colDate}>{dateStr}</Text>
                <Text style={styles.colLoc}>{m.location}</Text>
                <Text style={styles.colTime}>{m.startTimeCorr}</Text>
                <Text style={styles.colTime}>{m.endTimeCorr}</Text>
                <Text style={styles.colDur}>{m.durationNetto.toFixed(2)}</Text>
                <Text style={styles.colAmt}>{m.amount.toFixed(2)}</Text>
            </View>
          );
      })}

      {/* Totals */}
      <View style={styles.footerContainer}>
        <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Gesamtsumme:</Text>
            <Text style={styles.totalValue}>{totals.amount.toFixed(2)} €</Text>
        </View>
      </View>
      <View style={[styles.footerContainer, { marginTop: 0 }]}>
         <View style={[styles.totalBox, { borderTopWidth: 0, backgroundColor: 'white' }]}>
            <Text style={[styles.totalLabel, { fontSize: 8, color: '#666' }]}>Gesamtstunden:</Text>
            <Text style={[styles.totalValue, { fontSize: 8, color: '#666' }]}>{totals.hours.toFixed(2)} h</Text>
        </View>
      </View>

      {/* Signature - Compact, only Employee */}
      <View style={styles.signatureContainer}>
        <View style={styles.signatureLine}>
            <Text>Datum, Unterschrift Mitarbeiter</Text>
        </View>
      </View>

    </Page>
  </Document>
);

export default ReportPdfLayout;