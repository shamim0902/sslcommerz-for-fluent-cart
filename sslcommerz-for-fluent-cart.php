<?php
/**
 * Plugin Name: SSLCommerz for FluentCart
 * Plugin URI: https://fluentcart.com
 * Description: Accept payments via SSL Commerz in FluentCart - supports one-time payments, refunds, and multiple payment methods
 * Version: 1.0.0
 * Author: FluentCart
 * Author URI: https://fluentcart.com
 * Text Domain: sslcommerz-for-fluent-cart
 * Domain Path: /languages
 * Requires at least: 5.6
 * Tested up to: 6.9
 * Requires PHP: 7.4
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

defined('ABSPATH') || exit('Direct access not allowed.');

// Define plugin constants
define('SSLCOMMERZ_FC_VERSION', '1.0.0');
define('SSLCOMMERZ_FC_PLUGIN_FILE', __FILE__);
define('SSLCOMMERZ_FC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SSLCOMMERZ_FC_PLUGIN_URL', plugin_dir_url(__FILE__));


/**
 * Check if FluentCart is active
 */
function sslcommerz_fc_check_dependencies()
{
    if (!defined('FLUENTCART_VERSION')) {
        add_action('admin_notices', function () {
            ?>
            <div class="notice notice-error">
                <p>
                    <strong><?php esc_html_e('SSLCommerz for FluentCart', 'sslcommerz-for-fluent-cart'); ?></strong>
                    <?php esc_html_e('requires FluentCart to be installed and activated.', 'sslcommerz-for-fluent-cart'); ?>
                </p>
            </div>
            <?php
        });
        return false;
    }

    if (version_compare(FLUENTCART_VERSION, '1.2.5', '<')) {
        add_action('admin_notices', function () {
            ?>
            <div class="notice notice-error">
                <p>
                    <strong><?php esc_html_e('SSLCommerz for FluentCart', 'sslcommerz-for-fluent-cart'); ?></strong>
                    <?php esc_html_e('requires FluentCart version 1.2.5 or higher.', 'sslcommerz-for-fluent-cart'); ?>
                </p>
            </div>
            <?php
        });
        return false;
    }
    return true;
}

/**
 * Initialize the plugin
 */
add_action('plugins_loaded', function () {
    if (!sslcommerz_fc_check_dependencies()) {
        return;
    }

    // Register autoloader
    spl_autoload_register(function ($class) {
        $prefix = 'SslcommerzFluentCart\\';
        $baseDir = SSLCOMMERZ_FC_PLUGIN_DIR . 'includes/';

        $len = strlen($prefix);
        if (strncmp($prefix, $class, $len) !== 0) {
            return;
        }

        $relativeClass = substr($class, $len);
        $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

        if (file_exists($file)) {
            require $file;
        }
    });

    // Priority 10 runs before AddonGatewaysHandler (priority 20) so GatewayManager::has('sslcommerz')
    // returns true when AddonGatewaysHandler checks it, preventing the SSLCommerzAddon promo from registering.
    add_action('fluent_cart/register_payment_methods', function () {
        \SslcommerzFluentCart\SslcommerzGateway::register();
    }, 10);

    if (defined('FLUENTCART_PRO_PLUGIN_VERSION')) {
        new \SslcommerzFluentCart\PluginManager\Updater('https://fluentcart.com/', SSLCOMMERZ_FC_PLUGIN_FILE, [
            'version'           => SSLCOMMERZ_FC_VERSION,
            'addon_slug'        => 'sslcommerz-for-fluent-cart',
            'parent_product_id' => 21480,
            'plugin_title'      => 'SSLCommerz for FluentCart',
        ]);

        add_filter('plugin_row_meta', function ($links, $pluginFile) {
            if (plugin_basename(SSLCOMMERZ_FC_PLUGIN_FILE) !== $pluginFile) {
                return $links;
            }

            $checkUpdateUrl = esc_url(
                wp_nonce_url(
                    admin_url('plugins.php?sslcommerz-for-fluent-cart-check-update=' . time()),
                    'sslcommerz-for-fluent-cart-check-update'
                )
            );

            return array_merge($links, [
                'check_update' => '<a style="color: #583fad;font-weight: 600;" href="' . $checkUpdateUrl . '" aria-label="' . esc_attr__('Check Update', 'sslcommerz-for-fluent-cart') . '">' . esc_html__('Check Update', 'sslcommerz-for-fluent-cart') . '</a>',
            ]);
        }, 10, 2);
    }

}, 20);

/**
 * Activation hook
 */
register_activation_hook(__FILE__, 'sslcommerz_fc_on_activation');
register_deactivation_hook(__FILE__, 'sslcommerz_fc_on_deactivation');

function sslcommerz_fc_on_activation()
{
    if (!sslcommerz_fc_check_dependencies()) {
        deactivate_plugins(plugin_basename(__FILE__));
        wp_die(
            esc_html__('SSLCommerz for FluentCart requires FluentCart to be installed and activated.', 'sslcommerz-for-fluent-cart'),
            esc_html__('Plugin Activation Error', 'sslcommerz-for-fluent-cart'),
            ['back_link' => true]
        );
    }

    add_option('SSLCOMMERZ_FC_VERSION', SSLCOMMERZ_FC_VERSION);
    add_option('sslcommerz_fc_installed_time', time());
}

function sslcommerz_fc_on_deactivation()
{
    delete_transient('sslcommerz_fc_api_status');
}
