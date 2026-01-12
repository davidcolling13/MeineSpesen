import React from 'react';
import { pdf } from '@react-pdf/renderer';
import ReportPdfLayout from '../components/ReportPdfLayout';
import { ReportData } from '../types';

/**
 * Generiert ein PDF Blob für einen einzelnen Mitarbeiter-Report.
 */
export const generateSingleReportPdf = async (data: ReportData): Promise<Blob> => {
  const doc = <ReportPdfLayout data={data} />;
  return await pdf(doc).toBlob();
};

/**
 * Generiert ein PDF Blob für mehrere Reports (Sammeldruck).
 */
export const generateBulkReportPdf = async (reports: ReportData[]): Promise<Blob> => {
  const doc = <ReportPdfLayout reports={reports} />;
  return await pdf(doc).toBlob();
};
