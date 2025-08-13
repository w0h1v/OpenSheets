import { FilterRule, ConditionalFormat, CellFormat, ValidationRule } from '../types/spreadsheet';

/**
 * DFIR-specific utilities for Digital Forensics and Incident Response workflows
 */

// IOC (Indicator of Compromise) detection and validation
export const IOC_PATTERNS = {
  // Hash patterns
  md5: /^[a-fA-F0-9]{32}$/,
  sha1: /^[a-fA-F0-9]{40}$/,
  sha256: /^[a-fA-F0-9]{64}$/,
  sha512: /^[a-fA-F0-9]{128}$/,
  
  // Network patterns
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  ipv6: /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
  domain: /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/,
  url: /^https?:\/\/[^\s$.?#].[^\s]*$/i,
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  
  // File patterns
  registry: /^HKEY_[A-Z_]+\\.*$/,
  filepath: /^[a-zA-Z]:\\.*|^\/.*|^\$[A-Z_]+\\.*$/,
  
  // Other patterns
  cve: /^CVE-\d{4}-\d{4,}$/,
  bitcoin: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
};

// Private IP ranges for network analysis
export const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i
];

// Common malicious file extensions
export const SUSPICIOUS_EXTENSIONS = [
  '.exe', '.scr', '.bat', '.cmd', '.pif', '.com', '.vbs', '.js', '.jar', 
  '.ps1', '.msi', '.dll', '.sys', '.hta', '.wsf', '.wsh', '.reg'
];

// Known suspicious process names
export const SUSPICIOUS_PROCESSES = [
  'powershell.exe', 'cmd.exe', 'rundll32.exe', 'regsvr32.exe', 
  'mshta.exe', 'wscript.exe', 'cscript.exe', 'psexec.exe',
  'mimikatz.exe', 'procdump.exe', 'netcat.exe', 'ncat.exe'
];

// Severity levels for incident prioritization
export const SEVERITY_LEVELS = {
  CRITICAL: { level: 4, color: '#dc3545', description: 'Immediate threat requiring urgent action' },
  HIGH: { level: 3, color: '#fd7e14', description: 'Serious threat requiring prompt attention' },
  MEDIUM: { level: 2, color: '#ffc107', description: 'Potential threat requiring investigation' },
  LOW: { level: 1, color: '#28a745', description: 'Minimal threat for monitoring' },
  INFO: { level: 0, color: '#17a2b8', description: 'Informational entry' }
};

/**
 * IOC Detection Functions
 */
export function detectIOCType(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  
  const cleanValue = value.trim();
  
  if (IOC_PATTERNS.md5.test(cleanValue)) return 'MD5';
  if (IOC_PATTERNS.sha1.test(cleanValue)) return 'SHA1';
  if (IOC_PATTERNS.sha256.test(cleanValue)) return 'SHA256';
  if (IOC_PATTERNS.sha512.test(cleanValue)) return 'SHA512';
  if (IOC_PATTERNS.ipv4.test(cleanValue)) return 'IPv4';
  if (IOC_PATTERNS.ipv6.test(cleanValue)) return 'IPv6';
  if (IOC_PATTERNS.domain.test(cleanValue)) return 'Domain';
  if (IOC_PATTERNS.url.test(cleanValue)) return 'URL';
  if (IOC_PATTERNS.email.test(cleanValue)) return 'Email';
  if (IOC_PATTERNS.registry.test(cleanValue)) return 'Registry';
  if (IOC_PATTERNS.filepath.test(cleanValue)) return 'FilePath';
  if (IOC_PATTERNS.cve.test(cleanValue)) return 'CVE';
  if (IOC_PATTERNS.bitcoin.test(cleanValue)) return 'Bitcoin';
  
  return null;
}

export function isExternalIP(ip: string): boolean {
  return !PRIVATE_IP_RANGES.some(pattern => pattern.test(ip));
}

export function isSuspiciousFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUSPICIOUS_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function isSuspiciousProcess(processName: string): boolean {
  const lower = processName.toLowerCase();
  return SUSPICIOUS_PROCESSES.some(proc => lower.includes(proc));
}

/**
 * DFIR Timeline Analysis
 */
export function parseTimestamp(value: any): Date | null {
  if (!value) return null;
  
  // Handle various timestamp formats common in DFIR
  const _formats = [
    // ISO formats
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    // Windows FILETIME (as string)
    /^\d{17,18}$/,
    // Unix timestamp (seconds)
    /^\d{10}$/,
    // Unix timestamp (milliseconds)  
    /^\d{13}$/,
    // Common log formats
    /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}/,
  ];

  const str = String(value);
  
  // Try direct Date parsing first
  const directParse = new Date(value);
  if (!isNaN(directParse.getTime())) {
    return directParse;
  }

  // Handle Windows FILETIME (100-nanosecond intervals since Jan 1, 1601)
  if (/^\d{17,18}$/.test(str)) {
    const filetime = BigInt(str);
    const unixEpoch = BigInt('116444736000000000'); // FILETIME of Unix epoch
    const unixTime = Number((filetime - unixEpoch) / BigInt(10000));
    return new Date(unixTime);
  }

  // Handle Unix timestamps
  if (/^\d{10}$/.test(str)) {
    return new Date(Number(str) * 1000);
  }
  
  if (/^\d{13}$/.test(str)) {
    return new Date(Number(str));
  }

  return null;
}

export function isRecentActivity(timestamp: any, hoursAgo: number = 24): boolean {
  const date = parseTimestamp(timestamp);
  if (!date) return false;
  
  const threshold = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return date > threshold;
}

/**
 * DFIR-Specific Filter Presets
 */
export const DFIR_FILTERS = {
  // Network Analysis
  externalIPs: (column: number): FilterRule => ({
    column,
    type: 'custom',
    condition: 'equals',
    customFunction: (value) => {
      const str = String(value);
      return IOC_PATTERNS.ipv4.test(str) && isExternalIP(str);
    }
  }),

  privateIPs: (column: number): FilterRule => ({
    column,
    type: 'custom', 
    condition: 'equals',
    customFunction: (value) => {
      const str = String(value);
      return IOC_PATTERNS.ipv4.test(str) && !isExternalIP(str);
    }
  }),

  // File Analysis
  executableFiles: (column: number): FilterRule => ({
    column,
    type: 'custom',
    condition: 'equals', 
    customFunction: (value) => isSuspiciousFile(String(value))
  }),

  // Process Analysis
  suspiciousProcesses: (column: number): FilterRule => ({
    column,
    type: 'custom',
    condition: 'equals',
    customFunction: (value) => isSuspiciousProcess(String(value))
  }),

  // Hash Analysis
  validHashes: (column: number): FilterRule => ({
    column,
    type: 'custom',
    condition: 'equals',
    customFunction: (value) => {
      const str = String(value);
      return IOC_PATTERNS.md5.test(str) || 
             IOC_PATTERNS.sha1.test(str) || 
             IOC_PATTERNS.sha256.test(str);
    }
  }),

  // Timeline Analysis  
  recentActivity: (column: number, hours: number = 24): FilterRule => ({
    column,
    type: 'custom',
    condition: 'equals',
    customFunction: (value) => isRecentActivity(value, hours)
  }),

  // Severity Filtering
  highSeverity: (column: number): FilterRule => ({
    column,
    type: 'text',
    condition: 'contains',
    value: 'critical,high,severe',
    caseSensitive: false
  })
};

/**
 * DFIR-Specific Conditional Formatting Rules
 */
export const DFIR_CONDITIONAL_FORMATS = {
  // IOC Type Highlighting
  iacHighlighting: (iocType: string): ConditionalFormat => ({
    type: 'textContains',
    condition: 'contains',
    value1: iocType.toLowerCase(),
    format: getIOCTypeFormat(iocType)
  }),

  // Severity-Based Highlighting
  severityHighlighting: (): ConditionalFormat => ({
    type: 'textContains',
    condition: 'contains', 
    value1: 'critical,high,severe',
    format: {
      backgroundColor: SEVERITY_LEVELS.CRITICAL.color,
      color: '#ffffff',
      bold: true
    }
  }),

  // Network Traffic Analysis
  externalTrafficHighlighting: (): ConditionalFormat => ({
    type: 'formula',
    condition: 'equal',
    value1: 'NOT(OR(LEFT(value,3)="10.",LEFT(value,4)="172.",LEFT(value,4)="192.",LEFT(value,4)="127."))',
    format: {
      backgroundColor: '#fff3cd',
      color: '#856404',
      bold: true
    }
  }),

  // Recent Activity Highlighting
  recentActivityHighlighting: (hours: number = 24): ConditionalFormat => ({
    type: 'dateOccurring',
    condition: 'greaterThan',
    value1: `TODAY()-${hours/24}`,
    format: {
      backgroundColor: '#d4edda',
      color: '#155724',
      bold: true
    }
  }),

  // Malware/Suspicious File Highlighting
  suspiciousFileHighlighting: (): ConditionalFormat => ({
    type: 'textContains',
    condition: 'endsWith',
    value1: '.exe,.scr,.bat,.cmd,.pif,.com,.vbs,.js',
    format: {
      backgroundColor: '#f8d7da',
      color: '#721c24',
      bold: true
    }
  })
};

function getIOCTypeFormat(iocType: string): CellFormat {
  const formats: { [key: string]: CellFormat } = {
    'MD5': { backgroundColor: '#e1f5fe', color: '#01579b', fontFamily: 'monospace' },
    'SHA1': { backgroundColor: '#f3e5f5', color: '#4a148c', fontFamily: 'monospace' },
    'SHA256': { backgroundColor: '#e8f5e8', color: '#1b5e20', fontFamily: 'monospace' },
    'IPv4': { backgroundColor: '#fff8e1', color: '#f57f17' },
    'IPv6': { backgroundColor: '#fce4ec', color: '#880e4f' },
    'Domain': { backgroundColor: '#e0f2f1', color: '#004d40' },
    'URL': { backgroundColor: '#f1f8e9', color: '#33691e' },
    'Email': { backgroundColor: '#fff3e0', color: '#bf360c' },
    'Registry': { backgroundColor: '#fafafa', color: '#424242', fontFamily: 'monospace' },
    'FilePath': { backgroundColor: '#f5f5f5', color: '#616161', fontFamily: 'monospace' },
    'CVE': { backgroundColor: '#ffebee', color: '#c62828', bold: true },
    'Bitcoin': { backgroundColor: '#fff9c4', color: '#f57f17' }
  };

  return formats[iocType] || { backgroundColor: '#f5f5f5', color: '#424242' };
}

/**
 * DFIR-Specific Dropdown Presets
 */
export const DFIR_DROPDOWN_PRESETS = {
  // IOC Types with descriptions
  iocTypes: [
    'MD5 Hash',
    'SHA1 Hash', 
    'SHA256 Hash',
    'SHA512 Hash',
    'IPv4 Address',
    'IPv6 Address',
    'Domain Name',
    'URL',
    'Email Address',
    'File Path',
    'Registry Key',
    'CVE Identifier',
    'Bitcoin Address',
    'User Agent',
    'Mutex',
    'Service Name',
    'Process Name'
  ],

  // Severity levels with standardized naming
  severityLevels: [
    'Critical',
    'High', 
    'Medium',
    'Low',
    'Informational'
  ],

  // Investigation status tracking
  investigationStatus: [
    'New',
    'Assigned',
    'In Progress', 
    'Pending',
    'Investigating',
    'Analyzed',
    'Confirmed Threat',
    'False Positive',
    'Benign',
    'Resolved',
    'Closed'
  ],

  // Network protocols
  networkProtocols: [
    'TCP',
    'UDP',
    'ICMP',
    'HTTP',
    'HTTPS',
    'DNS',
    'FTP',
    'SFTP',
    'SSH',
    'Telnet',
    'SMTP',
    'POP3',
    'IMAP',
    'SNMP',
    'LDAP',
    'Kerberos',
    'NetBIOS',
    'SMB',
    'RDP'
  ],

  // Event types for timeline analysis
  eventTypes: [
    'Process Creation',
    'Process Termination',
    'File Creation',
    'File Modification',
    'File Deletion',
    'Registry Modification',
    'Network Connection',
    'User Logon',
    'User Logoff',
    'Service Start',
    'Service Stop',
    'System Boot',
    'System Shutdown',
    'Authentication Failure',
    'Privilege Escalation',
    'Malware Detection',
    'Firewall Block',
    'Intrusion Detection'
  ],

  // Risk classifications
  riskLevels: [
    'Safe',
    'Low Risk',
    'Medium Risk', 
    'High Risk',
    'Critical Risk',
    'Malicious',
    'Suspicious',
    'Unknown',
    'Benign'
  ],

  // Attack techniques (MITRE ATT&CK inspired)
  attackTechniques: [
    'Initial Access',
    'Execution',
    'Persistence',
    'Privilege Escalation',
    'Defense Evasion',
    'Credential Access',
    'Discovery',
    'Lateral Movement',
    'Collection',
    'Command and Control',
    'Exfiltration',
    'Impact'
  ],

  // File types commonly seen in DFIR
  fileTypes: [
    'Executable (.exe)',
    'Dynamic Library (.dll)',
    'Script (.bat, .cmd, .ps1)',
    'Document (.doc, .pdf, .xls)',
    'Archive (.zip, .rar, .7z)',
    'Image (.jpg, .png, .gif)',
    'Log File (.log, .txt)',
    'Configuration (.ini, .conf)',
    'Certificate (.crt, .pem)',
    'Database (.db, .sql)',
    'Unknown'
  ],

  // Evidence sources
  evidenceSources: [
    'Endpoint Detection',
    'Network Monitoring',
    'Log Analysis',
    'Memory Forensics',
    'Disk Forensics',
    'Cloud Logs',
    'Email Security',
    'Web Proxy',
    'Firewall',
    'IDS/IPS',
    'SIEM',
    'Threat Intelligence',
    'Manual Investigation',
    'User Report'
  ],

  // Incident categories
  incidentCategories: [
    'Malware Infection',
    'Phishing Attack',
    'Data Breach',
    'Unauthorized Access',
    'Denial of Service',
    'Insider Threat',
    'Social Engineering',
    'Advanced Persistent Threat',
    'Ransomware',
    'Cryptojacking',
    'Supply Chain Attack',
    'Zero-Day Exploit',
    'Policy Violation',
    'System Compromise'
  ],

  // Common ports for network analysis
  commonPorts: [
    '21 (FTP)',
    '22 (SSH)',
    '23 (Telnet)',
    '25 (SMTP)',
    '53 (DNS)',
    '80 (HTTP)',
    '110 (POP3)',
    '143 (IMAP)',
    '443 (HTTPS)',
    '993 (IMAPS)',
    '995 (POP3S)',
    '1433 (SQL Server)',
    '3306 (MySQL)',
    '3389 (RDP)',
    '5432 (PostgreSQL)',
    '8080 (HTTP Alt)',
    'Other'
  ]
};

/**
 * DFIR Column Templates for common incident response spreadsheets
 */
export const DFIR_COLUMN_TEMPLATES = {
  // IOC Tracking Template
  iocTemplate: [
    { header: 'Timestamp', type: 'date', validation: 'date' },
    { header: 'IOC Type', type: 'text', validation: 'list', 
      options: DFIR_DROPDOWN_PRESETS.iocTypes },
    { header: 'IOC Value', type: 'text', validation: 'custom' },
    { header: 'Severity', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.severityLevels },
    { header: 'Source', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.evidenceSources },
    { header: 'Description', type: 'text' },
    { header: 'Status', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.investigationStatus }
  ],

  // Network Analysis Template
  networkTemplate: [
    { header: 'Timestamp', type: 'date' },
    { header: 'Source IP', type: 'text' },
    { header: 'Destination IP', type: 'text' },
    { header: 'Port', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.commonPorts },
    { header: 'Protocol', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.networkProtocols },
    { header: 'Bytes Sent', type: 'number' },
    { header: 'Bytes Received', type: 'number' },
    { header: 'Classification', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.riskLevels }
  ],

  // File Analysis Template
  fileTemplate: [
    { header: 'Timestamp', type: 'date' },
    { header: 'File Path', type: 'text' },
    { header: 'File Name', type: 'text' },
    { header: 'File Size', type: 'number' },
    { header: 'MD5 Hash', type: 'text' },
    { header: 'SHA256 Hash', type: 'text' },
    { header: 'File Type', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.fileTypes },
    { header: 'Risk Level', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.riskLevels }
  ],

  // Event Timeline Template
  timelineTemplate: [
    { header: 'Timestamp', type: 'date' },
    { header: 'Event Type', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.eventTypes },
    { header: 'User', type: 'text' },
    { header: 'Host', type: 'text' },
    { header: 'Description', type: 'text' },
    { header: 'Severity', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.severityLevels },
    { header: 'Attack Technique', type: 'text', validation: 'list',
      options: DFIR_DROPDOWN_PRESETS.attackTechniques },
    { header: 'Notes', type: 'text' }
  ]
};

/**
 * Helper function to create DFIR validation rules with dropdown presets
 */
export function createDFIRValidationRule(
  presetType: keyof typeof DFIR_DROPDOWN_PRESETS,
  options: {
    allowCustomValues?: boolean;
    multiSelect?: boolean;
    searchable?: boolean;
    showDropdownArrow?: boolean;
    errorMessage?: string;
  } = {}
): ValidationRule {
  const {
    allowCustomValues = true,
    multiSelect = false,
    searchable = true,
    showDropdownArrow = true,
    errorMessage
  } = options;

  return {
    type: 'list',
    list: DFIR_DROPDOWN_PRESETS[presetType],
    allowCustomValues,
    multiSelect,
    searchable,
    showDropdownArrow,
    errorMessage: errorMessage || `Please select from the available ${presetType} options`,
    showError: true
  };
}

/**
 * Quick setup functions for DFIR scenarios
 */
export function setupIOCTrackingSheet() {
  return {
    columnTemplate: DFIR_COLUMN_TEMPLATES.iocTemplate,
    conditionalFormats: [
      DFIR_CONDITIONAL_FORMATS.severityHighlighting(),
      DFIR_CONDITIONAL_FORMATS.suspiciousFileHighlighting()
    ],
    filters: [],
    sheetFormatting: {
      theme: 'Default',
      showGridlines: true,
      frozenRows: 1,
      defaultFont: { family: 'Arial', size: 11, color: '#000000' }
    }
  };
}

export function setupNetworkAnalysisSheet() {
  return {
    columnTemplate: DFIR_COLUMN_TEMPLATES.networkTemplate,
    conditionalFormats: [
      DFIR_CONDITIONAL_FORMATS.externalTrafficHighlighting()
    ],
    filters: [],
    sheetFormatting: {
      theme: 'Blue',
      showGridlines: true,
      frozenRows: 1,
      defaultFont: { family: 'Courier New', size: 10, color: '#000000' }
    }
  };
}

export function setupTimelineAnalysisSheet() {
  return {
    columnTemplate: DFIR_COLUMN_TEMPLATES.timelineTemplate,
    conditionalFormats: [
      DFIR_CONDITIONAL_FORMATS.severityHighlighting(),
      DFIR_CONDITIONAL_FORMATS.recentActivityHighlighting(24)
    ],
    filters: [],
    sheetFormatting: {
      theme: 'Default',
      showGridlines: true,
      frozenRows: 1,
      defaultFont: { family: 'Arial', size: 11, color: '#000000' }
    }
  };
}