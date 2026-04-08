const PASSWORD = "AGUARA25";

function login(){
  const v = document.getElementById("pwd").value;
  if(v===PASSWORD){
    document.getElementById("panel").style.display="block";
  }else{
    alert("Contraseña incorrecta");
  }
}

function subir(){
  alert("Acá luego conectamos con Supabase Storage (listo para integrar)");
}

function render(){
  document.getElementById("lista").innerHTML = "<p>(lista dinámica acá)</p>";
}

render();
