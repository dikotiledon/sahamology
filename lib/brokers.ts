export type BrokerType = 'Smartmoney' | 'Whale' | 'Retail' | 'Mix';

export interface BrokerInfo {
  code: string;
  name: string;
  type: BrokerType;
}

export const BROKERS: Record<string, BrokerInfo> = {
  // Smartmoney
  "AN": { code: "AN", name: "Wanteg Sekuritas", type: "Smartmoney" },
  "AO": { code: "AO", name: "ERDIKHA ELIT SEKURITAS", type: "Smartmoney" },
  "AR": { code: "AR", name: "Binaartha Sekuritas", type: "Smartmoney" },
  "AT": { code: "AT", name: "Phintraco Sekuritas", type: "Smartmoney" },
  "BR": { code: "BR", name: "Trust Sekuritas", type: "Smartmoney" },
  "CD": { code: "CD", name: "Mega Capital Sekuritas", type: "Smartmoney" },
  "DD": { code: "DD", name: "Makindo Sekuritas", type: "Smartmoney" },
  "DH": { code: "DH", name: "SINARMAS SEKURITAS", type: "Smartmoney" },
  "DU": { code: "DU", name: "KAF Sekuritas Indonesia", type: "Smartmoney" },
  "DX": { code: "DX", name: "Bahana Sekuritas", type: "Smartmoney" },
  "EL": { code: "EL", name: "Evergreen Sekuritas Indonesia", type: "Smartmoney" },
  "FO": { code: "FO", name: "Forte Global Sekuritas", type: "Smartmoney" },
  "FZ": { code: "FZ", name: "Waterfront Sekuritas Indonesia", type: "Smartmoney" },
  "GA": { code: "GA", name: "BNC Sekuritas Indonesia", type: "Smartmoney" },
  "GI": { code: "GI", name: "Webull Sekuritas Indonesia", type: "Smartmoney" },
  "GR": { code: "GR", name: "PANIN SEKURITAS Tbk.", type: "Smartmoney" },
  "HP": { code: "HP", name: "Henan Putihrai Sekuritas", type: "Smartmoney" },
  "IC": { code: "IC", name: "Integrity Capital Sekuritas", type: "Smartmoney" },
  "ID": { code: "ID", name: "Anugerah Sekuritas Indonesia", type: "Smartmoney" },
  "IN": { code: "IN", name: "INVESTINDO NUSANTARA SEKURITA", type: "Smartmoney" },
  "IT": { code: "IT", name: "INTI TELADAN SEKURITAS", type: "Smartmoney" },
  "IU": { code: "IU", name: "Indo Capital Sekuritas", type: "Smartmoney" },
  "KI": { code: "KI", name: "Ciptadana Sekuritas Asia", type: "Smartmoney" },
  "KK": { code: "KK", name: "Phillip Sekuritas Indonesia", type: "Smartmoney" },
  "LG": { code: "LG", name: "Trimegah Sekuritas Indonesia Tbk.", type: "Smartmoney" },
  "MU": { code: "MU", name: "Minna Padi Investama Sekuritas", type: "Smartmoney" },
  "NI": { code: "NI", name: "BNI Sekuritas", type: "Smartmoney" },
  "OD": { code: "OD", name: "BRI Danareksa Sekuritas", type: "Smartmoney" },
  "PC": { code: "PC", name: "FAC Sekuritas Indonesia", type: "Smartmoney" },
  "PO": { code: "PO", name: "Pilarmas Investindo Sekuritas", type: "Smartmoney" },
  "PP": { code: "PP", name: "Aldiracita Sekuritas Indonesia", type: "Smartmoney" },
  "PS": { code: "PS", name: "PARAMITRA ALFA SEKURITAS", type: "Smartmoney" },
  "QA": { code: "QA", name: "Tuntun Sekuritas Indonesia", type: "Smartmoney" },
  "RF": { code: "RF", name: "Buana Capital Sekuritas", type: "Smartmoney" },
  "RG": { code: "RG", name: "Profindo Sekuritas Indonesia", type: "Smartmoney" },
  "RO": { code: "RO", name: "Pluang Maju Sekuritas", type: "Smartmoney" },
  "RS": { code: "RS", name: "Yulie Sekuritas Indonesia Tbk.", type: "Smartmoney" },
  "SA": { code: "SA", name: "Elit Sukses Sekuritas", type: "Smartmoney" },
  "SF": { code: "SF", name: "Surya Fajar Sekuritas", type: "Smartmoney" },
  "SH": { code: "SH", name: "Artha Sekuritas Indonesia", type: "Smartmoney" },
  "SQ": { code: "SQ", name: "BCA Sekuritas", type: "Smartmoney" },
  "SS": { code: "SS", name: "Supra Sekuritas Indonesia", type: "Smartmoney" },
  "TS": { code: "TS", name: "Dwidana Sakti Sekuritas", type: "Smartmoney" },
  "XA": { code: "XA", name: "NH Korindo Sekuritas Indonesia", type: "Smartmoney" },
  "ZR": { code: "ZR", name: "Bumiputera Sekuritas", type: "Smartmoney" },

  // Whale
  "AG": { code: "AG", name: "Kiwoom Sekuritas Indonesia", type: "Whale" },
  "AH": { code: "AH", name: "Shinhan Sekuritas Indonesia", type: "Whale" },
  "AI": { code: "AI", name: "UOB Kay Hian Sekuritas", type: "Whale" },
  "AK": { code: "AK", name: "UBS Sekuritas Indonesia", type: "Whale" },
  "BK": { code: "BK", name: "J.P. Morgan Sekuritas Indonesia", type: "Whale" },
  "BQ": { code: "BQ", name: "Korea Investment and Sekuritas Indonesia", type: "Whale" },
  "DP": { code: "DP", name: "DBS Vickers Sekuritas Indonesia", type: "Whale" },
  "FS": { code: "FS", name: "Yuanta Sekuritas Indonesia", type: "Whale" },
  "GW": { code: "GW", name: "HSBC Sekuritas Indonesia", type: "Whale" },
  "HD": { code: "HD", name: "KGI Sekuritas Indonesia", type: "Whale" },
  "MI": { code: "MI", name: "Victoria Sekuritas Indonesia", type: "Whale" },
  "RX": { code: "RX", name: "Macquarie Sekuritas Indonesia", type: "Whale" },
  "TP": { code: "TP", name: "OCBC Sekuritas Indonesia", type: "Whale" },
  "YU": { code: "YU", name: "CGS International Sekuritas Indonesia", type: "Whale" },
  "ZP": { code: "ZP", name: "Maybank Sekuritas Indonesia", type: "Whale" },

  // Retail
  "AD": { code: "AD", name: "OSO Sekuritas Indonesia", type: "Retail" },
  "AF": { code: "AF", name: "Harita Kencana Sekuritas", type: "Retail" },
  "AP": { code: "AP", name: "Pacific Sekuritas Indonesia", type: "Retail" },
  "AZ": { code: "AZ", name: "Sucor Sekuritas", type: "Retail" },
  "BF": { code: "BF", name: "Inti Fikasa Sekuritas", type: "Retail" },
  "DR": { code: "DR", name: "RHB Sekuritas Indonesia", type: "Retail" },
  "LS": { code: "LS", name: "Reliance Sekuritas Indonesia Tbk.", type: "Retail" },
  "OK": { code: "OK", name: "NET SEKURITAS", type: "Retail" },
  "PF": { code: "PF", name: "Danasakti Sekuritas Indonesia", type: "Retail" },
  "PI": { code: "PI", name: "Magenta Kapital Sekuritas Indonesia", type: "Retail" },
  "RB": { code: "RB", name: "Ina Sekuritas Indonesia", type: "Retail" },
  "TF": { code: "TF", name: "Laba Sekuritas Indonesia", type: "Retail" },
  "XC": { code: "XC", name: "Ajaib Sekuritas Asia", type: "Retail" },
  "XL": { code: "XL", name: "Stockbit Sekuritas Digital", type: "Retail" },
  "YB": { code: "YB", name: "Yakin Bertumbuh Sekuritas", type: "Retail" },
  "YJ": { code: "YJ", name: "Lotus Andalan Sekuritas", type: "Retail" },
  "YO": { code: "YO", name: "Amantara Sekuritas Indonesia", type: "Retail" },

  // Mix
  "BB": { code: "BB", name: "Verdhana Sekuritas Indonesia", type: "Mix" },
  "BS": { code: "BS", name: "Equity Sekuritas Indonesia", type: "Mix" },
  "CC": { code: "CC", name: "MANDIRI SEKURITAS", type: "Mix" },
  "CP": { code: "CP", name: "KB Valbury Sekuritas", type: "Mix" },
  "EP": { code: "EP", name: "MNC Sekuritas", type: "Mix" },
  "ES": { code: "ES", name: "EKOKAPITAL SEKURITAS", type: "Mix" },
  "IF": { code: "IF", name: "SAMUEL SEKURITAS INDONESIA", type: "Mix" },
  "IH": { code: "IH", name: "Indo Harvest Sekuritas", type: "Mix" },
  "II": { code: "II", name: "Danatama Makmur Sekuritas", type: "Mix" },
  "KZ": { code: "KZ", name: "CLSA Sekuritas Indonesia", type: "Mix" },
  "MG": { code: "MG", name: "Semesta Indovest Sekuritas", type: "Mix" },
  "PD": { code: "PD", name: "Indo Premier Sekuritas", type: "Mix" },
  "PG": { code: "PG", name: "Panca Global Sekuritas", type: "Mix" },
  "YP": { code: "YP", name: "Mirae Asset Sekuritas Indonesia", type: "Mix" },
};

export const getBrokerInfo = (code: string): BrokerInfo => {
  // Unknown broker codes fold into 'Mix' — there is no separate Unknown
  // display state in the broker_status union or CSS badge variants.
  return BROKERS[code.toUpperCase()] || { code, name: "Unknown Broker", type: "Mix" };
};
