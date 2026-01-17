import type { certificate } from '@zhexin/typebox/certificate';
import type { dns } from '@zhexin/typebox/dns';
import type { endpoint } from '@zhexin/typebox/endpoint';
import type { experimental } from '@zhexin/typebox/experimental';
import type { inbound } from '@zhexin/typebox/inbound';
import type { log } from '@zhexin/typebox/log';
import type { ntp } from '@zhexin/typebox/ntp';
import type { outbound } from '@zhexin/typebox/outbound';
import type { route } from '@zhexin/typebox/route';
import type { service } from '@zhexin/typebox/service';

export type Inbound = inbound<string, string, string, string, string>;
export type Outbound = outbound<string, string, string>;
export type DnsConfig = dns<
	string,
	string,
	string,
	string,
	dns.server<string, string, string, string>
>;
export type DnsServer = dns.server<string, string, string, string>;
export type DnsRule = dns.rule<string, string, string, string>;
export type RouteConfig = route<string, string, string, route.rule_set<string, string>>;
export type RouteRule = route.rule<string, string, string, string>;
export type RuleSet = route.rule_set<string, string>;
export type LogConfig = log;
export type CertificateConfig = certificate;
export type ExperimentalConfig = experimental;
export type Endpoint = endpoint<string, string, string>;
export type Service = service<string, string, string, string>;

export type NtpConfig = Partial<ntp<string, string>> & { enabled?: boolean };

export interface SingBoxConfig {
	$schema?: string;
	log?: LogConfig;
	dns?: DnsConfig;
	endpoints?: Endpoint[];
	inbounds?: Inbound[];
	outbounds?: Outbound[];
	route?: RouteConfig;
	services?: Service[];
	experimental?: ExperimentalConfig;
	ntp?: NtpConfig;
	certificate?: CertificateConfig;
}

export type {
	certificate,
	dns,
	endpoint,
	experimental,
	inbound,
	log,
	ntp,
	outbound,
	route,
	service,
};
