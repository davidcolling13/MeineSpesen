import React from 'react';
import { Page, Text, View, Document, StyleSheet, Svg, Path } from '@react-pdf/renderer';
import { ReportData } from '../types';

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
  companyInfo: {
    fontSize: 8,
    color: '#444',
    marginBottom: 6,
    textTransform: 'uppercase',
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
    justifyContent: 'flex-end',
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
  // colDur needs flex row to align text and icon
  colDur: { width: '10%', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 5 },
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
    marginTop: 60,
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
  // Supports either a single report or an array of reports for bulk printing
  data?: ReportData;
  reports?: ReportData[];
}

const ReportPageContent: React.FC<{ data: ReportData }> = ({ data }) => {
    const { movements, employee, monthName, year, totals } = data;
    
    // Filter empty records (No duration, no amount, no location)
    const activeMovements = movements.filter(m => 
        m.durationNetto > 0 || 
        m.amount > 0 || 
        (m.location && m.location.trim().length > 0)
    );

    return (
    <Page size="A4" style={styles.page}>
      
      {/* Header */}
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.companyInfo}>Colling Transporte GmbH & Co KG • Sindorfer Str. 55a • 50189 Elsdorf</Text>
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
      {activeMovements.map((m) => {
          // Format date DD.MM.YYYY manually to avoid timezone shift from "new Date()"
          const [y, month, d] = m.date.split('-');
          const dateStr = `${d}.${month}.${y}`;
          
          return (
            <View key={m.id} style={styles.tableRow}>
                <Text style={styles.colDate}>{dateStr}</Text>
                <Text style={styles.colLoc}>{m.location}</Text>
                <Text style={styles.colTime}>{m.startTimeCorr}</Text>
                <Text style={styles.colTime}>{m.endTimeCorr}</Text>
                <View style={styles.colDur}>
                    <Text>{m.durationNetto.toFixed(2)}</Text>
                    {m.amount > 0 ? (
                        <Svg width={8} height={8} viewBox="0 0 24 24" style={{ marginLeft: 4 }}>
                            <Path d="M20 6L9 17L4 12" stroke="#16a34a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </Svg>
                    ) : (
                         <Svg width={8} height={8} viewBox="0 0 24 24" style={{ marginLeft: 4 }}>
                            <Path d="M18 6L6 18M6 6L18 18" stroke="#ef4444" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </Svg>
                    )}
                </View>
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
      {/* Total hours removed as requested */}

    </Page>
    );
};

const ReportPdfLayout: React.FC<ReportPdfProps> = ({ data, reports }) => {
    // If we have an array of reports (Bulk Print)
    if (reports && reports.length > 0) {
        return (
            <Document>
                {reports.map((r, idx) => (
                    <ReportPageContent key={idx} data={r} />
                ))}
            </Document>
        );
    }

    // Single report
    if (data) {
        return (
            <Document>
                <ReportPageContent data={data} />
            </Document>
        );
    }

    return <Document><Page><Text>No Data</Text></Page></Document>;
};

export default ReportPdfLayout;