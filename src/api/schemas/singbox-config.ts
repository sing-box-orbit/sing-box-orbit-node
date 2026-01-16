import { type Static, Type } from 'fets';

export const logConfigSchema = Type.Object(
	{
		disabled: Type.Optional(Type.Boolean()),
		level: Type.Optional(
			Type.Union([
				Type.Literal('trace'),
				Type.Literal('debug'),
				Type.Literal('info'),
				Type.Literal('warn'),
				Type.Literal('error'),
				Type.Literal('fatal'),
				Type.Literal('panic'),
			]),
		),
		output: Type.Optional(Type.String()),
		timestamp: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const dnsServerSchema = Type.Object(
	{
		tag: Type.String(),
		address: Type.String(),
		address_resolver: Type.Optional(Type.String()),
		address_strategy: Type.Optional(
			Type.Union([
				Type.Literal('prefer_ipv4'),
				Type.Literal('prefer_ipv6'),
				Type.Literal('ipv4_only'),
				Type.Literal('ipv6_only'),
			]),
		),
		strategy: Type.Optional(
			Type.Union([
				Type.Literal('prefer_ipv4'),
				Type.Literal('prefer_ipv6'),
				Type.Literal('ipv4_only'),
				Type.Literal('ipv6_only'),
			]),
		),
		detour: Type.Optional(Type.String()),
		client_subnet: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

export const fakeIPConfigSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		inet4_range: Type.Optional(Type.String()),
		inet6_range: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const dnsRuleSchema = Type.Object(
	{
		server: Type.String(),
		inbound: Type.Optional(Type.Array(Type.String())),
		ip_version: Type.Optional(Type.Union([Type.Literal(4), Type.Literal(6)])),
		query_type: Type.Optional(Type.Array(Type.String())),
		network: Type.Optional(Type.Array(Type.Union([Type.Literal('tcp'), Type.Literal('udp')]))),
		domain: Type.Optional(Type.Array(Type.String())),
		domain_suffix: Type.Optional(Type.Array(Type.String())),
		domain_keyword: Type.Optional(Type.Array(Type.String())),
		domain_regex: Type.Optional(Type.Array(Type.String())),
		source_ip_cidr: Type.Optional(Type.Array(Type.String())),
		port: Type.Optional(Type.Array(Type.Number())),
		port_range: Type.Optional(Type.Array(Type.String())),
		invert: Type.Optional(Type.Boolean()),
		outbound: Type.Optional(Type.Array(Type.String())),
		disable_cache: Type.Optional(Type.Boolean()),
		rewrite_ttl: Type.Optional(Type.Number()),
		client_subnet: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

export const dnsConfigSchema = Type.Object(
	{
		servers: Type.Optional(Type.Array(dnsServerSchema)),
		rules: Type.Optional(Type.Array(dnsRuleSchema)),
		final: Type.Optional(Type.String()),
		strategy: Type.Optional(
			Type.Union([
				Type.Literal('prefer_ipv4'),
				Type.Literal('prefer_ipv6'),
				Type.Literal('ipv4_only'),
				Type.Literal('ipv6_only'),
			]),
		),
		disable_cache: Type.Optional(Type.Boolean()),
		disable_expire: Type.Optional(Type.Boolean()),
		independent_cache: Type.Optional(Type.Boolean()),
		reverse_mapping: Type.Optional(Type.Boolean()),
		fakeip: Type.Optional(fakeIPConfigSchema),
	},
	{ additionalProperties: true },
);

export const ntpConfigSchema = Type.Object(
	{
		enabled: Type.Optional(Type.Boolean()),
		server: Type.Optional(Type.String()),
		server_port: Type.Optional(Type.Number()),
		interval: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

export const certificateConfigSchema = Type.Object(
	{
		certificate: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
		certificate_path: Type.Optional(Type.String()),
		key: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
		key_path: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

export const inboundSchema = Type.Object(
	{
		tag: Type.String(),
		type: Type.String(),
		listen: Type.Optional(Type.String()),
		listen_port: Type.Optional(Type.Number()),
	},
	{ additionalProperties: true },
);

export const outboundSchema = Type.Object(
	{
		tag: Type.String(),
		type: Type.String(),
	},
	{ additionalProperties: true },
);

export const ruleSetSchema = Type.Object(
	{
		tag: Type.String(),
		type: Type.String(),
	},
	{ additionalProperties: true },
);

export const routeRuleSchema = Type.Object({}, { additionalProperties: true });

export const routeConfigSchema = Type.Object(
	{
		rules: Type.Optional(Type.Array(routeRuleSchema)),
		rule_set: Type.Optional(Type.Array(ruleSetSchema)),
		final: Type.Optional(Type.String()),
		auto_detect_interface: Type.Optional(Type.Boolean()),
		override_android_vpn: Type.Optional(Type.Boolean()),
		default_interface: Type.Optional(Type.String()),
		default_mark: Type.Optional(Type.Number()),
	},
	{ additionalProperties: true },
);

export const endpointSchema = Type.Object(
	{
		tag: Type.String(),
		type: Type.String(),
	},
	{ additionalProperties: true },
);

export const serviceSchema = Type.Object(
	{
		tag: Type.String(),
		type: Type.String(),
	},
	{ additionalProperties: true },
);

export const experimentalConfigSchema = Type.Object({}, { additionalProperties: true });

const knownTopLevelFields = [
	'log',
	'dns',
	'ntp',
	'certificate',
	'endpoints',
	'inbounds',
	'outbounds',
	'route',
	'services',
	'experimental',
] as const;

export const singBoxConfigSchema = Type.Object(
	{
		log: Type.Optional(logConfigSchema),
		dns: Type.Optional(dnsConfigSchema),
		ntp: Type.Optional(ntpConfigSchema),
		certificate: Type.Optional(certificateConfigSchema),
		endpoints: Type.Optional(Type.Array(endpointSchema)),
		inbounds: Type.Optional(Type.Array(inboundSchema)),
		outbounds: Type.Optional(Type.Array(outboundSchema)),
		route: Type.Optional(routeConfigSchema),
		services: Type.Optional(Type.Array(serviceSchema)),
		experimental: Type.Optional(experimentalConfigSchema),
	},
	{ additionalProperties: false },
);

export type SingBoxConfigInput = Static<typeof singBoxConfigSchema>;

export { knownTopLevelFields };
