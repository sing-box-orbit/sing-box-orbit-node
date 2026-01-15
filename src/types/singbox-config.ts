export interface SingBoxConfig {
	log?: LogConfig;
	dns?: DnsConfig;
	ntp?: NtpConfig;
	certificate?: CertificateConfig;
	endpoints?: Endpoint[];
	inbounds?: Inbound[];
	outbounds?: Outbound[];
	route?: RouteConfig;
	services?: Service[];
	experimental?: ExperimentalConfig;
}

export interface LogConfig {
	disabled?: boolean;
	level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'panic';
	output?: string;
	timestamp?: boolean;
}

export interface DnsConfig {
	servers?: DnsServer[];
	rules?: DnsRule[];
	final?: string;
	strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
	disable_cache?: boolean;
	disable_expire?: boolean;
	independent_cache?: boolean;
	reverse_mapping?: boolean;
	fakeip?: FakeIPConfig;
}

export interface DnsServer {
	tag: string;
	address: string;
	address_resolver?: string;
	address_strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
	strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
	detour?: string;
	client_subnet?: string;
}

export interface DnsRule {
	inbound?: string[];
	ip_version?: 4 | 6;
	query_type?: string[];
	network?: ('tcp' | 'udp')[];
	auth_user?: string[];
	protocol?: string[];
	domain?: string[];
	domain_suffix?: string[];
	domain_keyword?: string[];
	domain_regex?: string[];
	geosite?: string[];
	source_geoip?: string[];
	source_ip_cidr?: string[];
	source_port?: number[];
	source_port_range?: string[];
	port?: number[];
	port_range?: string[];
	clash_mode?: string;
	invert?: boolean;
	outbound?: string[];
	server: string;
	disable_cache?: boolean;
	rewrite_ttl?: number;
	client_subnet?: string;
}

export interface FakeIPConfig {
	enabled?: boolean;
	inet4_range?: string;
	inet6_range?: string;
}

export interface NtpConfig {
	enabled?: boolean;
	server?: string;
	server_port?: number;
	interval?: string;
}

export type Inbound =
	| DirectInbound
	| HttpInbound
	| SocksInbound
	| MixedInbound
	| ShadowsocksInbound
	| VMessInbound
	| VLESSInbound
	| TrojanInbound
	| TunInbound
	| RedirectInbound
	| TProxyInbound;

interface BaseInbound {
	tag: string;
	listen?: string;
	listen_port?: number;
	tcp_fast_open?: boolean;
	tcp_multi_path?: boolean;
	udp_fragment?: boolean;
	udp_timeout?: string;
	detour?: string;
	sniff?: boolean;
	sniff_override_destination?: boolean;
	sniff_timeout?: string;
	domain_strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
}

export interface DirectInbound extends BaseInbound {
	type: 'direct';
	network?: 'tcp' | 'udp';
	override_address?: string;
	override_port?: number;
}

export interface HttpInbound extends BaseInbound {
	type: 'http';
	users?: HttpUser[];
	tls?: InboundTlsConfig;
}

export interface SocksInbound extends BaseInbound {
	type: 'socks';
	users?: SocksUser[];
}

export interface MixedInbound extends BaseInbound {
	type: 'mixed';
	users?: HttpUser[];
}

export interface ShadowsocksInbound extends BaseInbound {
	type: 'shadowsocks';
	method: string;
	password: string;
	users?: ShadowsocksUser[];
	destinations?: ShadowsocksDestination[];
}

export interface VMessInbound extends BaseInbound {
	type: 'vmess';
	users: VMessUser[];
	tls?: InboundTlsConfig;
	transport?: TransportConfig;
}

export interface VLESSInbound extends BaseInbound {
	type: 'vless';
	users: VLESSUser[];
	tls?: InboundTlsConfig;
	transport?: TransportConfig;
}

export interface TrojanInbound extends BaseInbound {
	type: 'trojan';
	users: TrojanUser[];
	tls?: InboundTlsConfig;
	fallback?: TrojanFallback;
	transport?: TransportConfig;
}

export interface TunInbound {
	type: 'tun';
	tag: string;
	interface_name?: string;
	inet4_address?: string | string[];
	inet6_address?: string | string[];
	mtu?: number;
	auto_route?: boolean;
	strict_route?: boolean;
	inet4_route_address?: string[];
	inet6_route_address?: string[];
	inet4_route_exclude_address?: string[];
	inet6_route_exclude_address?: string[];
	endpoint_independent_nat?: boolean;
	stack?: 'system' | 'gvisor' | 'mixed';
	include_interface?: string[];
	exclude_interface?: string[];
	include_uid?: number[];
	include_uid_range?: string[];
	exclude_uid?: number[];
	exclude_uid_range?: string[];
	include_android_user?: number[];
	include_package?: string[];
	exclude_package?: string[];
	platform?: TunPlatformConfig;
	sniff?: boolean;
	sniff_override_destination?: boolean;
	sniff_timeout?: string;
	domain_strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
}

export interface RedirectInbound extends BaseInbound {
	type: 'redirect';
}

export interface TProxyInbound extends BaseInbound {
	type: 'tproxy';
	network?: 'tcp' | 'udp';
}

export type Outbound =
	| DirectOutbound
	| BlockOutbound
	| DnsOutbound
	| SocksOutbound
	| HttpOutbound
	| ShadowsocksOutbound
	| VMessOutbound
	| VLESSOutbound
	| TrojanOutbound
	| WireGuardOutbound
	| HysteriaOutbound
	| Hysteria2Outbound
	| SelectorOutbound
	| UrlTestOutbound;

interface BaseOutbound {
	tag: string;
	detour?: string;
	bind_interface?: string;
	inet4_bind_address?: string;
	inet6_bind_address?: string;
	routing_mark?: number;
	reuse_addr?: boolean;
	connect_timeout?: string;
	tcp_fast_open?: boolean;
	tcp_multi_path?: boolean;
	udp_fragment?: boolean;
	domain_strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
	fallback_delay?: string;
}

export interface DirectOutbound extends BaseOutbound {
	type: 'direct';
	override_address?: string;
	override_port?: number;
}

export interface BlockOutbound {
	type: 'block';
	tag: string;
}

export interface DnsOutbound {
	type: 'dns';
	tag: string;
}

export interface SocksOutbound extends BaseOutbound {
	type: 'socks';
	server: string;
	server_port: number;
	version?: '4' | '4a' | '5';
	username?: string;
	password?: string;
	network?: 'tcp' | 'udp';
	udp_over_tcp?: boolean | UdpOverTcpConfig;
}

export interface HttpOutbound extends BaseOutbound {
	type: 'http';
	server: string;
	server_port: number;
	username?: string;
	password?: string;
	path?: string;
	headers?: Record<string, string[]>;
	tls?: OutboundTlsConfig;
}

export interface ShadowsocksOutbound extends BaseOutbound {
	type: 'shadowsocks';
	server: string;
	server_port: number;
	method: string;
	password: string;
	plugin?: string;
	plugin_opts?: string;
	network?: 'tcp' | 'udp';
	udp_over_tcp?: boolean | UdpOverTcpConfig;
	multiplex?: MultiplexConfig;
}

export interface VMessOutbound extends BaseOutbound {
	type: 'vmess';
	server: string;
	server_port: number;
	uuid: string;
	security?: 'auto' | 'none' | 'zero' | 'aes-128-gcm' | 'chacha20-poly1305';
	alter_id?: number;
	global_padding?: boolean;
	authenticated_length?: boolean;
	network?: 'tcp' | 'udp';
	tls?: OutboundTlsConfig;
	packet_encoding?: 'none' | 'packetaddr' | 'xudp';
	multiplex?: MultiplexConfig;
	transport?: TransportConfig;
}

export interface VLESSOutbound extends BaseOutbound {
	type: 'vless';
	server: string;
	server_port: number;
	uuid: string;
	flow?: string;
	network?: 'tcp' | 'udp';
	tls?: OutboundTlsConfig;
	packet_encoding?: 'none' | 'packetaddr' | 'xudp';
	multiplex?: MultiplexConfig;
	transport?: TransportConfig;
}

export interface TrojanOutbound extends BaseOutbound {
	type: 'trojan';
	server: string;
	server_port: number;
	password: string;
	network?: 'tcp' | 'udp';
	tls?: OutboundTlsConfig;
	multiplex?: MultiplexConfig;
	transport?: TransportConfig;
}

export interface WireGuardOutbound extends BaseOutbound {
	type: 'wireguard';
	server: string;
	server_port: number;
	system_interface?: boolean;
	interface_name?: string;
	local_address: string[];
	private_key: string;
	peers?: WireGuardPeer[];
	peer_public_key?: string;
	pre_shared_key?: string;
	reserved?: number[];
	mtu?: number;
	network?: 'tcp' | 'udp';
}

export interface HysteriaOutbound extends BaseOutbound {
	type: 'hysteria';
	server: string;
	server_port: number;
	up?: string;
	up_mbps?: number;
	down?: string;
	down_mbps?: number;
	obfs?: string;
	auth?: string;
	auth_str?: string;
	recv_window_conn?: number;
	recv_window?: number;
	disable_mtu_discovery?: boolean;
	network?: 'tcp' | 'udp';
	tls?: OutboundTlsConfig;
}

export interface Hysteria2Outbound extends BaseOutbound {
	type: 'hysteria2';
	server: string;
	server_port: number;
	up_mbps?: number;
	down_mbps?: number;
	obfs?: Hysteria2Obfs;
	password?: string;
	network?: 'tcp' | 'udp';
	tls?: OutboundTlsConfig;
	brutal_debug?: boolean;
}

export interface SelectorOutbound {
	type: 'selector';
	tag: string;
	outbounds: string[];
	default?: string;
	interrupt_exist_connections?: boolean;
}

export interface UrlTestOutbound {
	type: 'urltest';
	tag: string;
	outbounds: string[];
	url?: string;
	interval?: string;
	tolerance?: number;
	idle_timeout?: string;
	interrupt_exist_connections?: boolean;
}

export interface RouteConfig {
	rules?: RouteRule[];
	rule_set?: RuleSet[];
	final?: string;
	auto_detect_interface?: boolean;
	override_android_vpn?: boolean;
	default_interface?: string;
	default_mark?: number;
}

export interface RouteRule {
	inbound?: string[];
	ip_version?: 4 | 6;
	network?: ('tcp' | 'udp')[];
	auth_user?: string[];
	protocol?: string[];
	domain?: string[];
	domain_suffix?: string[];
	domain_keyword?: string[];
	domain_regex?: string[];
	geosite?: string[];
	source_geoip?: string[];
	geoip?: string[];
	source_ip_cidr?: string[];
	ip_cidr?: string[];
	source_port?: number[];
	source_port_range?: string[];
	port?: number[];
	port_range?: string[];
	process_name?: string[];
	process_path?: string[];
	package_name?: string[];
	user?: string[];
	user_id?: number[];
	clash_mode?: string;
	invert?: boolean;
	outbound: string;
}

export interface RuleSet {
	type: 'local' | 'remote';
	tag: string;
	format: 'source' | 'binary';
	path?: string;
	url?: string;
	download_detour?: string;
	update_interval?: string;
}

export interface ExperimentalConfig {
	cache_file?: CacheFileConfig;
	clash_api?: ClashApiConfig;
	v2ray_api?: V2RayApiConfig;
}

export interface CacheFileConfig {
	enabled?: boolean;
	path?: string;
	cache_id?: string;
	store_fakeip?: boolean;
	store_rdrc?: boolean;
	rdrc_timeout?: string;
}

export interface ClashApiConfig {
	external_controller?: string;
	external_ui?: string;
	external_ui_download_url?: string;
	external_ui_download_detour?: string;
	secret?: string;
	default_mode?: string;
}

export interface V2RayApiConfig {
	listen?: string;
	stats?: V2RayStatsConfig;
}

export interface V2RayStatsConfig {
	enabled?: boolean;
	inbounds?: string[];
	outbounds?: string[];
	users?: string[];
}

export interface HttpUser {
	username: string;
	password: string;
}

export interface SocksUser {
	username: string;
	password: string;
}

export interface ShadowsocksUser {
	name?: string;
	password: string;
}

export interface ShadowsocksDestination {
	name?: string;
	password: string;
	server: string;
	server_port: number;
}

export interface VMessUser {
	name?: string;
	uuid: string;
	alter_id?: number;
}

export interface VLESSUser {
	name?: string;
	uuid: string;
	flow?: string;
}

export interface TrojanUser {
	name?: string;
	password: string;
}

export interface TrojanFallback {
	server?: string;
	server_port?: number;
}

export interface InboundTlsConfig {
	enabled?: boolean;
	server_name?: string;
	alpn?: string[];
	min_version?: string;
	max_version?: string;
	cipher_suites?: string[];
	certificate?: string[];
	certificate_path?: string;
	key?: string[];
	key_path?: string;
	acme?: AcmeConfig;
	ech?: EchConfig;
	reality?: RealityConfig;
}

export interface OutboundTlsConfig {
	enabled?: boolean;
	disable_sni?: boolean;
	server_name?: string;
	insecure?: boolean;
	alpn?: string[];
	min_version?: string;
	max_version?: string;
	cipher_suites?: string[];
	certificate?: string[];
	certificate_path?: string;
	ech?: EchConfig;
	utls?: UtlsConfig;
	reality?: RealityConfig;
}

export interface AcmeConfig {
	domain?: string[];
	data_directory?: string;
	default_server_name?: string;
	email?: string;
	provider?: string;
	disable_http_challenge?: boolean;
	disable_tls_alpn_challenge?: boolean;
	alternative_http_port?: number;
	alternative_tls_port?: number;
	external_account?: AcmeExternalAccount;
	dns01_challenge?: AcmeDns01Challenge;
}

export interface AcmeExternalAccount {
	key_id?: string;
	mac_key?: string;
}

export interface AcmeDns01Challenge {
	provider?: string;
}

export interface EchConfig {
	enabled?: boolean;
	pq_signature_schemes_enabled?: boolean;
	dynamic_record_sizing_disabled?: boolean;
	config?: string[];
	config_path?: string;
}

export interface UtlsConfig {
	enabled?: boolean;
	fingerprint?: string;
}

export interface RealityConfig {
	enabled?: boolean;
	handshake?: RealityHandshake;
	private_key?: string;
	public_key?: string;
	short_id?: string[];
	max_time_difference?: string;
}

export interface RealityHandshake {
	server?: string;
	server_port?: number;
}

export interface TransportConfig {
	type: 'http' | 'ws' | 'quic' | 'grpc' | 'httpupgrade';
	host?: string[];
	path?: string;
	headers?: Record<string, string[]>;
	method?: string;
	max_early_data?: number;
	early_data_header_name?: string;
	service_name?: string;
	idle_timeout?: string;
	ping_timeout?: string;
	permit_without_stream?: boolean;
}

export interface MultiplexConfig {
	enabled?: boolean;
	protocol?: 'smux' | 'yamux' | 'h2mux';
	max_connections?: number;
	min_streams?: number;
	max_streams?: number;
	padding?: boolean;
	brutal?: BrutalConfig;
}

export interface BrutalConfig {
	enabled?: boolean;
	up_mbps?: number;
	down_mbps?: number;
}

export interface UdpOverTcpConfig {
	enabled?: boolean;
	version?: number;
}

export interface Hysteria2Obfs {
	type: 'salamander';
	password: string;
}

export interface WireGuardPeer {
	server: string;
	server_port: number;
	public_key: string;
	pre_shared_key?: string;
	allowed_ips?: string[];
	reserved?: number[];
}

export interface TunPlatformConfig {
	http_proxy?: TunHttpProxyConfig;
}

export interface TunHttpProxyConfig {
	enabled?: boolean;
	server: string;
	server_port: number;
	bypass_domain?: string[];
	match_domain?: string[];
}

// Endpoints (sing-box 1.11.0+)
export type Endpoint = WireGuardEndpoint | TailscaleEndpoint;

export interface WireGuardEndpoint {
	type: 'wireguard';
	tag: string;
	system?: boolean;
	name?: string;
	mtu?: number;
	address: string[];
	private_key: string;
	listen_port?: number;
	peers: WireGuardEndpointPeer[];
	udp_timeout?: string;
	workers?: number;
}

export interface WireGuardEndpointPeer {
	address?: string;
	port?: number;
	public_key: string;
	pre_shared_key?: string;
	allowed_ips: string[];
	persistent_keepalive_interval?: number;
	reserved?: number[];
}

export interface TailscaleEndpoint {
	type: 'tailscale';
	tag: string;
	state_directory?: string;
	auth_key?: string;
	control_url?: string;
	ephemeral?: boolean;
	hostname?: string;
	accept_routes?: boolean;
	exit_node?: string;
	exit_node_allow_lan_access?: boolean;
	advertise_routes?: string[];
	advertise_exit_node?: boolean;
	relay_server_port?: number;
	relay_server_static_endpoints?: string[];
	system_interface?: boolean;
	system_interface_name?: string;
	system_interface_mtu?: number;
	udp_timeout?: string;
}

// Services (sing-box 1.12.0+)
export type Service = CcmService | DerpService | OcmService | ResolvedService | SsmApiService;

// Base interface for listen fields shared by services
interface BaseService {
	tag: string;
	listen?: string;
	listen_port?: number;
}

// CCM - Claude Code Multiplexer
export interface CcmService extends BaseService {
	type: 'ccm';
	credential_path?: string;
	usages_path?: string;
	users?: ServiceUser[];
	headers?: Record<string, string>;
	detour?: string;
	tls?: InboundTlsConfig;
}

// DERP - Tailscale DERP relay server
export interface DerpService extends BaseService {
	type: 'derp';
	config_path?: string;
	tls?: InboundTlsConfig;
	verify_client_endpoint?: string[];
	verify_client_url?: string[];
	home?: string;
	mesh_with?: string[];
	mesh_psk?: string;
	mesh_psk_file?: string;
	stun?: DerpStunConfig;
}

export interface DerpStunConfig {
	listen?: string;
	listen_port?: number;
}

// OCM - OpenAI Codex Multiplexer
export interface OcmService extends BaseService {
	type: 'ocm';
	credential_path?: string;
	usages_path?: string;
	users?: ServiceUser[];
	headers?: Record<string, string>;
	detour?: string;
	tls?: InboundTlsConfig;
}

// Resolved - fake systemd-resolved DBUS service
export interface ResolvedService extends BaseService {
	type: 'resolved';
}

// SSM API - Shadowsocks Server Management API
export interface SsmApiService extends BaseService {
	type: 'ssm-api';
	servers?: Record<string, string>;
	cache_path?: string;
	tls?: InboundTlsConfig;
}

// Shared user type for CCM and OCM services
export interface ServiceUser {
	name: string;
	token: string;
}

// Certificate (sing-box 1.12.0+)
// Defines the global X509 trusted certificate settings
export interface CertificateConfig {
	// Default X509 trusted CA certificate list
	// 'system' (default): System trusted CA certificates
	// 'mozilla': Mozilla's CA list (China CAs removed)
	// 'chrome': Chrome Root Store (China CAs removed)
	// 'none': Empty list
	store?: 'system' | 'mozilla' | 'chrome' | 'none';
	// Certificate line array to trust, in PEM format
	certificate?: string | string[];
	// Paths to certificate files to trust, in PEM format (auto-reloaded on change)
	certificate_path?: string | string[];
	// Directory paths to search for certificates to trust, in PEM format (auto-reloaded on change)
	certificate_directory_path?: string | string[];
}
