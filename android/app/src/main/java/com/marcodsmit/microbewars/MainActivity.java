package com.marcodsmit.microbewars;

import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private FrameLayout launchArt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                if (!"about:blank".equals(url)) removeLaunchArt();
            }

            @Override
            public void onReceivedError(WebView view) {
                removeLaunchArt();
            }

            @Override
            public void onReceivedHttpError(WebView view) {
                removeLaunchArt();
            }
        });
        super.onCreate(savedInstanceState);

        if (getBridge() == null) return;
        launchArt = new FrameLayout(this);
        launchArt.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        ImageView starfield = new ImageView(this);
        starfield.setImageResource(R.drawable.launch_starfield);
        starfield.setScaleType(ImageView.ScaleType.CENTER_CROP);
        launchArt.addView(starfield, new FrameLayout.LayoutParams(-1, -1));

        ImageView shield = new ImageView(this);
        shield.setImageResource(R.drawable.launch_shield);
        shield.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int size = Math.round(112 * getResources().getDisplayMetrics().density);
        launchArt.addView(shield, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        addContentView(launchArt, new ViewGroup.LayoutParams(-1, -1));
    }

    private void removeLaunchArt() {
        if (launchArt != null) {
            ((ViewGroup) launchArt.getParent()).removeView(launchArt);
            launchArt = null;
        }
    }
}
