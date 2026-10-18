package com.lr.rhythm;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONArray;
import java.util.Calendar;

public class ReminderReceiver extends BroadcastReceiver {
    static final String CHANNEL="rhythm-gentle";
    static void schedule(Context c){
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        boolean enabled=c.getSharedPreferences("reminders",0).getBoolean("enabled",false);
        if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)enabled=false;
        String times=c.getSharedPreferences("reminders",0).getString("times","[\"08:10\",\"13:40\",\"21:30\"]");
        try{JSONArray a=new JSONArray(times);for(int i=0;i<3;i++){
            Intent intent=new Intent(c,ReminderReceiver.class).setAction("com.lr.rhythm.REMIND").putExtra("slot",i);
            PendingIntent pi=PendingIntent.getBroadcast(c,i,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);am.cancel(pi);
            if(enabled){String[] t=a.getString(i).split(":");Calendar next=Calendar.getInstance();next.set(Calendar.HOUR_OF_DAY,Integer.parseInt(t[0]));next.set(Calendar.MINUTE,Integer.parseInt(t[1]));next.set(Calendar.SECOND,0);next.set(Calendar.MILLISECOND,0);if(next.getTimeInMillis()<=System.currentTimeMillis())next.add(Calendar.DAY_OF_YEAR,1);am.setInexactRepeating(AlarmManager.RTC_WAKEUP,next.getTimeInMillis(),AlarmManager.INTERVAL_DAY,pi);}
        }}catch(Exception ignored){}
    }
    @Override public void onReceive(Context c,Intent intent){
        if(!"com.lr.rhythm.REMIND".equals(intent.getAction())){schedule(c);return;}
        if(!c.getSharedPreferences("reminders",0).getBoolean("enabled",false))return;
        if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26){NotificationChannel ch=new NotificationChannel(CHANNEL,"朝夕 · 温柔提醒",NotificationManager.IMPORTANCE_DEFAULT);ch.setDescription("上午准备、下午准备和晚间收尾");nm.createNotificationChannel(ch);}
        int slot=intent.getIntExtra("slot",0);if(slot<0||slot>2)return;
        String[] title={"给上午一点准备时间","让下午慢慢进入状态","今天，也辛苦了"};
        String[] body={"喝点水，准备8:30的练题时光。","起身走走，准备14:00的稳定输出。","收好今天的记录，慢慢安静下来。"};
        Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi=PendingIntent.getActivity(c,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder n=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c);
        nm.notify(200+slot,n.setSmallIcon(com.lr.rhythm.R.drawable.ic_notification).setContentTitle(title[slot]).setContentText(body[slot]).setContentIntent(pi).setAutoCancel(true).build());
    }
}
