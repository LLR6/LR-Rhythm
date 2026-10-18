package com.lr.rhythm;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.AtomicFile;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int PICK_IMAGES=100, EXPORT=101, IMPORT=102, NOTIFICATIONS=103;
    private static final int MAX_BYTES=24000000;
    private static final String ORIGIN="https://app.lr.local/";
    private final Object fileLock=new Object();
    private WebView web;
    private ValueCallback<Uri[]> imageCallback;
    private String pendingExport;
    private final ExecutorService io=Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(246,247,243));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web=new WebView(this);
        web.setBackgroundColor(Color.rgb(246,247,243));
        web.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        WebSettings ws=web.getSettings();
        ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);ws.setAllowFileAccess(false);ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(false);ws.setAllowUniversalAccessFromFileURLs(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);ws.setSupportMultipleWindows(false);
        ws.setMediaPlaybackRequiresUserGesture(true);ws.setTextZoom(100);
        if(Build.VERSION.SDK_INT>=26)ws.setSafeBrowsingEnabled(true);
        web.addJavascriptInterface(new Bridge(),"Native");
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri u=req.getUrl();
                if("https".equals(u.getScheme())&&"app.lr.local".equals(u.getHost())&&u.getPort()==-1){
                    String p=u.getPath();if(p==null||p.equals("/"))p="/index.html";
                    if(p.equals("/index.html")||p.equals("/style.css")||p.equals("/app.js")||p.equals("/core.js")){
                        try{String ext=p.substring(p.lastIndexOf('.')+1);String mime=ext.equals("js")?"application/javascript":ext.equals("css")?"text/css":"text/html";return new WebResourceResponse(mime,"UTF-8",getAssets().open(p.substring(1)));}catch(IOException ignored){}
                    }
                }
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return !req.getUrl().toString().equals(ORIGIN+"index.html");}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(imageCallback!=null)imageCallback.onReceiveValue(null);imageCallback=callback;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("image/*");pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try{startActivityForResult(pick,PICK_IMAGES);}catch(Exception e){imageCallback.onReceiveValue(null);imageCallback=null;notice("找不到图片选择器，请检查系统文件应用");}return true;
            }
        });
        setContentView(web);web.loadUrl(ORIGIN+"index.html");
    }
    private AtomicFile dataFile(){return new AtomicFile(new File(getFilesDir(),"rhythm-state.json"));}
    private String readText(InputStream in) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n,total=0;
        try(InputStream src=in){while((n=src.read(buffer))!=-1){total+=n;if(total>MAX_BYTES)throw new IOException("文件超过大小限制");out.write(buffer,0,n);}}
        return out.toString("UTF-8");
    }
    private void js(String function,String value){runOnUiThread(()->{if(web!=null)web.evaluateJavascript("window."+function+"&&window."+function+"("+JSONObject.quote(value)+")",null);});}
    private void notice(String s){js("nativeNotice",s);}
    public final class Bridge {
        @JavascriptInterface public String readState(){synchronized(fileLock){AtomicFile f=dataFile();if(!f.getBaseFile().exists()&&!new File(f.getBaseFile().getPath()+".bak").exists())return "";try{return readText(f.openRead());}catch(IOException e){return "{unreadable}";}}}
        @JavascriptInterface public boolean writeState(String raw){
            if(raw==null||raw.getBytes(StandardCharsets.UTF_8).length>MAX_BYTES)return false;
            synchronized(fileLock){AtomicFile f=dataFile();FileOutputStream out=null;try{new JSONObject(raw);out=f.startWrite();out.write(raw.getBytes(StandardCharsets.UTF_8));f.finishWrite(out);return true;}catch(Exception e){if(out!=null)f.failWrite(out);return false;}}
        }
        @JavascriptInterface public void haptic(){runOnUiThread(()->web.performHapticFeedback(HapticFeedbackConstants.CONFIRM));}
        @JavascriptInterface public void exportData(String raw,String filename){if(raw==null||raw.getBytes(StandardCharsets.UTF_8).length>MAX_BYTES){notice("备份过大，请减少不需要的图片");return;}runOnUiThread(()->{pendingExport=raw;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,filename.replaceAll("[^a-zA-Z0-9_.-]","_"));try{startActivityForResult(i,EXPORT);}catch(Exception e){pendingExport=null;notice("无法打开系统保存界面");}});}
        @JavascriptInterface public void importData(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");try{startActivityForResult(i,IMPORT);}catch(Exception e){notice("无法打开系统文件界面");}});}
        @JavascriptInterface public void setReminders(boolean enabled,String json){
            try{JSONArray a=new JSONArray(json);if(a.length()!=3)return;for(int i=0;i<3;i++)if(!a.getString(i).matches("([01]\\d|2[0-3]):[0-5]\\d"))return;}catch(Exception e){return;}
            getSharedPreferences("reminders",MODE_PRIVATE).edit().putBoolean("enabled",enabled).putString("times",json).apply();
            runOnUiThread(()->{if(enabled&&Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);}else ReminderReceiver.schedule(MainActivity.this);});
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==PICK_IMAGES){if(imageCallback!=null){imageCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));imageCallback=null;}return;}
        if(result!=RESULT_OK||data==null||data.getData()==null){if(request==EXPORT)pendingExport=null;return;}
        Uri uri=data.getData();
        if(request==EXPORT){String text=pendingExport;pendingExport=null;if(text==null){notice("保存流程已中断，请重试导出");return;}io.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));notice("完整备份已保存");}catch(Exception e){notice("保存失败，请检查目标位置与空间");}});}
        if(request==IMPORT){io.execute(()->{try{String raw=readText(getContentResolver().openInputStream(uri));js("receiveImport",raw);}catch(Exception e){notice("无法读取备份：文件过大或格式不正确");}});}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==NOTIFICATIONS){boolean ok=results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED;if(!ok)getSharedPreferences("reminders",MODE_PRIVATE).edit().putBoolean("enabled",false).apply();ReminderReceiver.schedule(this);if(web!=null)web.evaluateJavascript("window.onReminderPermission&&window.onReminderPermission("+ok+")",null);}}
    @Override public void onBackPressed(){web.evaluateJavascript("window.androidBack?window.androidBack():false",result->{if(!"true".equals(result))web.evaluateJavascript("!!window.hasUnsaved",unsaved->new AlertDialog.Builder(this).setTitle("稍作休息？").setMessage("true".equals(unsaved)?"有记录尚未成功保存，请先导出备份；现在退出可能丢失刚才的更改。":"已成功保存的记录下次回来仍可查看。").setPositiveButton("离开",(d,w)->finish()).setNegativeButton("留下",null).show());});}
    @Override protected void onDestroy(){if(imageCallback!=null)imageCallback.onReceiveValue(null);if(web!=null){web.removeJavascriptInterface("Native");web.destroy();web=null;}io.shutdown();super.onDestroy();}
}
